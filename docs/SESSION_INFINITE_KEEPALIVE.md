# Session 永久保活机制

## 🎯 设计目标

**参考 VSCode 的行为**：终端会话无限期保活，即使长时间不使用也不会自动关闭。

用户可以：
- 切换 workspace 后随时切回，会话仍在运行
- 断开连接几小时甚至几天，重连后继续工作
- 不担心会话被意外清理，只有明确关闭才会销毁

## 📋 实现原则

### 1. 只有明确操作才关闭 Session

| 操作 | 行为 | 说明 |
|------|------|------|
| **关闭 Tab** | 关闭 session | 用户明确关闭，发送 `worker:kill` |
| **关闭 Workspace** | 关闭 session | 切换到新 workspace 时清理旧的 |
| **应用退出** | 关闭所有 session | `disposeTabs` 统一清理 |
| **WebSocket 断开** | **不关闭** ❌ | Session 继续运行 |
| **长时间无连接** | **不关闭** ❌ | 永久保活 |

### 2. WebSocket 断开≠Session 关闭

**关键设计**：
- WebSocket 是**数据通道**，可以断开重连
- Session 是**进程实体**，只有明确kill才销毁
- 两者生命周期解耦

**场景示例**：
```
用户操作：
  1. 打开终端，运行 `tail -f /var/log/syslog`
  2. 切换到其他 workspace
  3. WebSocket 断开（前端组件隐藏）
  4. 过了 2 小时
  5. 切回原 workspace
  6. WebSocket 重连
  7. ✅ 终端仍在运行，继续输出日志
```

## 🔧 技术实现

### 移除断连超时机制

**Before（有超时）**：
```typescript
socket.on("close", () => {
  runtime.activeSocket = null;
  // 5分钟后自动关闭
  runtime.disconnectTimer = setTimeout(() => {
    if (!runtime?.activeSocket) {
      shutdown(0);
    }
  }, 5 * 60 * 1000);
});
```

**After（永久保活）**：
```typescript
socket.on("close", () => {
  console.log(`[worker] Client disconnected`);
  runtime.activeSocket = null;
  // No auto-shutdown - session stays alive indefinitely like VSCode.
  // Only shutdown when explicitly killed via worker:kill message.
});
```

### 清理 disconnectTimer 相关代码

1. **移除类型定义**：
   ```typescript
   type RuntimeState = {
     // ...
     // disconnectTimer: NodeJS.Timeout | null;  // 删除
   };
   ```

2. **移除初始化**：
   ```typescript
   runtime = {
     // ...
     // disconnectTimer: null  // 删除
   };
   ```

3. **简化重连逻辑**：
   ```typescript
   server.on("connection", (socket) => {
     const isReconnect = runtime!.activeSocket !== null;
     console.log(`[worker] Client ${isReconnect ? 'reconnected' : 'connected'}`);
     runtime!.activeSocket = socket;
     flushPendingOutput();
   });
   ```

## 📊 行为对比

### Before（5分钟超时）

```
Timeline:
  00:00 - 用户在 Workspace A 打开终端
  00:05 - 切换到 Workspace B
  00:05 - WebSocket 断开，启动 5 分钟倒计时
  05:05 - ❌ Session 被自动关闭
  10:00 - 用户切回 Workspace A
  10:00 - ❌ 终端显示 "ws disconnected"，无法恢复
```

### After（永久保活）

```
Timeline:
  00:00 - 用户在 Workspace A 打开终端
  00:05 - 切换到 Workspace B
  00:05 - WebSocket 断开，但 session 继续运行
  10:00 - 用户切回 Workspace A
  10:00 - ✅ WebSocket 重连，终端仍在运行

甚至：
  00:00 - 打开终端
  12:00 - 切换 workspace 或断开连接
  [第二天]
  10:00 - 重连
  10:00 - ✅ 终端仍在运行，过去22小时的输出都在
```

## 🛡️ 防止进程泄漏

虽然没有超时自动清理，但有以下机制防止进程泄漏：

### 1. 应用退出时统一清理

```typescript
// App.tsx
useEffect(() => {
  return () => {
    // 应用退出时清理所有 tabs
    disposeTabs(tabsRef.current);
  };
}, []);
```

### 2. 关闭 Tab 时清理

```typescript
const closeTab = async (tabId: string) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab?.session) {
    await window.localtermApi.session.killSession({
      sessionId: tab.session.sessionId
    });
  }
  // ...
};
```

### 3. 关闭 Workspace 时清理

```typescript
const closeWorkspaceById = async (workspaceId: string) => {
  // 如果是当前 workspace，清理所有 session
  if (workspaceId === workspace.id) {
    await disposeTabs(tabsRef.current);
  }
  // ...
};
```

### 4. Debug 工具清理孤儿进程

```bash
# 手动清理遗留进程
pnpm kill:orphans

# 查看当前会话状态
pnpm debug:sessions
```

## 💾 内存与性能考虑

### 内存占用

**每个活跃 session**：
- Node.js 子进程：~20-50 MB
- node-pty 缓冲：~1-2 MB
- WebSocket 缓冲：~256 KB（pending output buffer）

**10 个 session**：约 200-500 MB

### 终端输出缓冲

```typescript
const MAX_PENDING_OUTPUT_BYTES = 256 * 1024;  // 256 KB per session

// 自动裁剪旧输出
while (runtime.pendingOutputBytes > MAX_PENDING_OUTPUT_BYTES) {
  const removed = runtime.pendingOutput.shift();
  runtime.pendingOutputBytes -= removed.byteLength;
}
```

**策略**：
- WebSocket 连接时：缓冲最近 256 KB 输出
- WebSocket 断开时：只保留最近 256 KB，旧的丢弃
- 重连后：推送缓冲内容，用户看到最近的输出

### 性能优化建议

1. **用户习惯**：定期关闭不用的 tab（和 VSCode 一样）
2. **UI 提示**：显示当前活跃 session 数量
3. **批量清理**：提供"关闭所有后台 session"按钮

## 🧪 测试验证

### 测试场景 1：长时间断开

```bash
pnpm dev

# 1. 打开终端，运行持续输出
while true; do echo "[$(date +%H:%M:%S)] Still running"; sleep 1; done

# 2. 切换到其他 workspace

# 3. 等待 10 分钟（甚至 1 小时）

# 4. 切回原 workspace

# ✅ 预期：终端仍在运行，时间戳连续
```

### 测试场景 2：关闭后重启应用

```bash
# 1. 打开终端，运行持续输出

# 2. 关闭应用（Ctrl+C 或关闭窗口）

# 3. 重新启动 pnpm dev

# ✅ 预期：
#   - 如果 restorePolicy: "recreate"，重建新 session
#   - 如果 restorePolicy: "manual"，显示占位，不自动连接
```

### 测试场景 3：验证无进程泄漏

```bash
# 1. 创建 10 个终端

# 2. 检查进程
pnpm debug:sessions
# 应该看到 10 个 session

# 3. 关闭 5 个 tab

# 4. 再次检查
pnpm debug:sessions
# 应该只剩 5 个 session

# 5. 关闭应用

# 6. 检查孤儿进程
pnpm kill:orphans
# ✅ 应该没有遗留进程（或自动清理）
```

## 📝 用户指南

### 最佳实践

**✅ 推荐**：
- 长期运行的任务（日志监控、后台服务）放在独立 workspace
- 定期关闭不用的 tab 释放资源
- 使用 `pnpm debug:sessions` 检查活跃会话

**❌ 避免**：
- 不要无限制创建 tab（会占用内存）
- 不要依赖超时自动清理（已移除）

### 故障排查

**问题**：终端显示 "ws disconnected"
- **原因**：WebSocket 连接断开
- **解决**：等待自动重连（350ms），或手动刷新

**问题**：内存占用高
- **原因**：过多活跃 session
- **解决**：关闭不用的 tab，或重启应用

**问题**：应用退出后有遗留进程
- **原因**：cleanup 未正确执行
- **解决**：运行 `pnpm kill:orphans`

## 🎉 用户体验提升

参考 VSCode 的永久保活机制后：

✅ **不再担心会话丢失**
✅ **可以长时间切换 workspace**
✅ **支持"暂停"工作，稍后恢复**
✅ **类似 tmux/screen 的体验，但更简单**

---

**实现日期**: 2026-03-02
**参考**: VSCode 终端行为
**原则**: 只有明确关闭才销毁 session
**文件**: `packages/session-worker/src/main.ts`
