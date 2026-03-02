# Orphan Tabs 保活测试指南

## 🎯 测试目标

验证非当前活跃的 workspace 中的终端会话，在后台保持运行不断开。

## 📋 测试场景

### 场景 1：切换 workspace 后保持连接

**步骤**：
```bash
# 1. 启动应用
pnpm dev

# 2. 在默认 Workspace A 创建 3 个终端
# 每个终端运行持续输出命令：

# Terminal 1
while true; do echo "[$(date +%H:%M:%S)] Terminal 1 running"; sleep 1; done

# Terminal 2
while true; do echo "[$(date +%H:%M:%S)] Terminal 2 running"; sleep 1; done

# Terminal 3
while true; do echo "[$(date +%H:%M:%S)] Terminal 3 running"; sleep 1; done
```

**验证点 1**：所有终端显示 "ws connected"
- ✅ 预期：3 个终端都显示 "ws connected"
- ❌ 失败：任何终端显示 "ws disconnected"

**步骤 2**：创建并切换到新 workspace
```
1. 点击 "New Workspace" 按钮
2. 系统切换到 Workspace B（空布局）
3. 等待 10 秒（观察是否有异常）
```

**验证点 2**：打开 DevTools 检查日志
- ✅ 预期：看到 `[TerminalPane] WS connect effect triggered` 但没有 cleanup 日志
- ❌ 失败：看到 `[TerminalPane] Cleaning up WS connection` 日志

**验证点 3**：检查 orphan tabs 渲染
```
在 DevTools Elements 面板搜索：data-orphan-tab
```
- ✅ 预期：找到 3 个 `<div data-orphan-tab="...">` 元素（隐藏的）
- ❌ 失败：找不到或数量不对

**步骤 3**：在 Workspace B 工作一段时间
```
1. 在 Workspace B 创建 1-2 个新终端
2. 执行一些命令
3. 等待 2-3 分钟
```

**验证点 4**：切回 Workspace A
```
1. 打开 workspace 管理器
2. 点击 Workspace A
3. 立即观察 3 个终端的状态
```

- ✅ 预期：
  - 所有终端仍显示 "ws connected"
  - 时间戳连续（如切走前是 14:30:45，切回时是 14:33:12）
  - 可以立即输入命令并执行

- ❌ 失败：
  - 任何终端显示 "ws disconnected"
  - 时间戳断档或重置
  - 无法输入命令

---

### 场景 2：长时间在其他 workspace 工作

**步骤**：
```bash
# 1. 重复场景 1 的步骤 1-2（创建 Workspace A 的终端并切换到 B）

# 2. 在 Workspace B 停留更长时间
# 设置一个 6 分钟的计时器
```

**验证点 5**：4 分钟后切回 Workspace A
- ✅ 预期：所有终端仍然 "ws connected"（5分钟超时未触发）
- ❌ 失败：终端断开

**验证点 6**：6 分钟后切回 Workspace A
- ✅ 预期：终端可能断开（超过 5 分钟超时）
- 📝 注意：这是预期行为，用于清理真正被遗弃的会话

---

### 场景 3：多个 workspace 互相切换

**步骤**：
```bash
# 1. 创建 3 个 workspace：A、B、C
# 2. 在每个 workspace 创建 2 个终端（共 6 个终端）
# 3. 按顺序切换：A → B → C → A → B → C
# 4. 每次切换间隔 10-30 秒
```

**验证点 7**：循环切换后所有终端状态
- ✅ 预期：所有 6 个终端都保持 "ws connected"
- ✅ 预期：每次切回某个 workspace，终端输出连续
- ❌ 失败：任何终端断开或输出中断

---

### 场景 4：Orphan tabs 内存占用

**步骤**：
```bash
# 1. 创建 Workspace A，开启 10 个终端
# 2. 切换到 Workspace B
# 3. 打开任务管理器，观察内存占用
# 4. 等待 1-2 分钟
```

**验证点 8**：内存占用是否合理
- ✅ 预期：内存占用稳定，不持续增长
- ❌ 失败：内存持续增长（可能内存泄漏）

---

## 🐛 调试技巧

### 1. 查看 WebSocket 连接状态

**DevTools Console**：
```javascript
// 应该看到持续的日志输出（每秒一次）
[TerminalPane] WS connect effect triggered - tabId=xxx
[worker:xxx] Client connected
```

**不应该看到**：
```javascript
// 如果看到这个，说明组件被卸载了
[TerminalPane] Cleaning up WS connection for tabId=xxx
[worker:xxx] Client disconnected
[worker:xxx] Starting 5-minute disconnect timer
```

### 2. 检查 Orphan Tabs 渲染

**DevTools Elements**：
```html
<!-- 应该能找到隐藏容器 -->
<div class="hidden" aria-hidden="true">
  <div data-orphan-tab="session-xxx">
    <!-- TerminalPane 组件 -->
  </div>
  <div data-orphan-tab="session-yyy">
    <!-- TerminalPane 组件 -->
  </div>
</div>
```

### 3. 查看 Session Registry

```bash
pnpm debug:sessions
```

**输出示例**：
```json
{
  "registry": {
    "session-xxx": {
      "pid": 12345,
      "port": 3001,
      "status": "ready"
    },
    "session-yyy": {
      "pid": 12346,
      "port": 3002,
      "status": "ready"
    }
  }
}
```

- ✅ 所有 orphan tabs 的 session 应该都存在
- ❌ 如果 session 消失，说明被意外清理了

### 4. 监控后端日志

**观察的关键日志**：
```
[worker:xxx] Client connected         // 重连成功
[worker:xxx] Client reconnected, canceling disconnect timer  // 取消超时
[worker:xxx] Client disconnected      // 断开
[worker:xxx] Starting 5-minute disconnect timer  // 启动超时
```

---

## 📊 预期行为总结

| 场景 | 预期行为 | 失败标志 |
|------|---------|---------|
| **热切换** | Orphan tabs 保持 "ws connected" | 显示 "ws disconnected" |
| **后台保活** | 4 分钟内切回仍连接 | 提前断开 |
| **超时清理** | 5 分钟后断开 | 不清理或提前清理 |
| **输出连续** | 时间戳连续不中断 | 时间戳断档或重置 |
| **内存稳定** | 内存占用稳定 | 内存持续增长 |

---

## ✅ 成功标准

- [ ] 场景 1：切换后立即保持连接
- [ ] 场景 2：4 分钟内保活，6 分钟后清理
- [ ] 场景 3：多 workspace 循环切换无断连
- [ ] 场景 4：内存占用稳定

所有场景通过，说明 Orphan Tabs 保活机制工作正常！🎉

---

## 🔍 常见问题

### Q1：为什么 Orphan Tabs 需要隐藏渲染？
**A**：React 的 `useEffect` 依赖于组件生命周期。如果组件卸载，cleanup 函数会执行，导致 WebSocket 关闭。隐藏渲染确保组件持续存在。

### Q2：隐藏渲染会影响性能吗？
**A**：影响很小。`display: none` 的元素不参与布局和绘制，主要开销是组件状态维护和 WebSocket 连接（这正是我们需要的）。

### Q3：为什么不用 Keep-Alive 或 Portal？
**A**：
- Keep-Alive 是 Vue 特性，React 没有原生支持
- Portal 会改变 DOM 结构，可能影响事件冒泡
- 简单的隐藏容器最可靠、最易理解

### Q4：5 分钟超时会不会太短？
**A**：可以根据实际使用调整。5 分钟是平衡点：
- 足够支持正常的 workspace 切换工作流
- 不会让真正被遗弃的进程存活太久

---

**测试完成后，请更新 `WS_DISCONNECT_FIX.md` 的验收清单！**
