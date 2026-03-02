# Workspace 热切换优化

## 📋 背景

原有实现在切换 workspace 时会 kill 所有现有会话并重新创建，导致用户数据丢失和不必要的性能开销。

## 🎯 优化目标

实现 **workspace 热切换**：
- 运行时切换 workspace 仅切换布局，保留所有现有会话
- 只在"冷启动"场景下才根据 `restorePolicy` 重建会话

## 🔧 实现方案

### 1. 核心修改

将 `restoreWorkspaceSnapshot` 的参数从简单的 `killExisting: boolean` 升级为 options 对象：

```typescript
// Before:
restoreWorkspaceSnapshot(snapshot, killExisting: boolean)

// After:
restoreWorkspaceSnapshot(snapshot, {
  killExisting: boolean,  // 是否kill现有会话
  coldBoot: boolean       // 是否冷启动（重建会话）
})
```

### 2. 两种恢复模式

#### 🔥 热切换模式（Hot Switch）
```typescript
{ killExisting: false, coldBoot: false }
```
- **适用场景**：运行时切换 workspace
- **行为**：
  - ✅ 只更新布局（pane树结构、活动pane）
  - ✅ 不触碰 tabs 数据
  - ✅ 不触碰会话状态
  - ✅ 所有终端连接保持活跃

#### ❄️ 冷启动模式（Cold Boot）
```typescript
{ killExisting: true/false, coldBoot: true }
```
- **适用场景**：
  - 应用启动时恢复默认 workspace
  - 关闭当前 workspace 后切换到另一个
  - 创建新的空 workspace
- **行为**：
  - ✅ 根据 `restorePolicy` 决定是否重建会话
  - ✅ `restorePolicy: "recreate"` → 自动重建终端会话
  - ✅ `restorePolicy: "manual"` → 只恢复布局，等待用户手动连接

### 3. 各场景映射

| 场景 | killExisting | coldBoot | 说明 |
|------|-------------|----------|------|
| **应用启动** | `false` | `true` | 首次加载，根据 restorePolicy 重建 |
| **热切换 workspace** | `false` | `false` | 只切换布局，保留会话 |
| **关闭 workspace** | `true` | `true` | Kill 当前会话，重建新的 |
| **创建空 workspace** | `true` | `true` | 清空并创建新环境 |

## 📊 优化效果

### Before（热切换会重建）
```
用户操作：切换到 "Dev Environment" workspace
系统行为：
  1. Kill 所有现有终端会话 ❌
  2. 关闭所有 WebSocket 连接 ❌
  3. 加载新 workspace 布局
  4. 遍历 tabs，检查 restorePolicy
  5. 重新创建终端会话 ❌
  6. 重新建立 WebSocket 连接 ❌

问题：
  - 丢失所有未保存的终端输出
  - 重建耗时长（每个会话需要fork进程）
  - 用户体验差（看到"重新连接"闪烁）
```

### After（热切换保留会话）
```
用户操作：切换到 "Dev Environment" workspace
系统行为：
  1. 保存当前 workspace 状态
  2. 加载新 workspace 布局
  3. 只更新 pane 树结构 ✅
  4. 更新活动 pane ID ✅
  5. 所有会话保持运行 ✅

优势：
  - 零数据丢失（所有终端保持运行）
  - 瞬间切换（无需等待进程重建）
  - 用户体验顺滑（无闪烁）
```

## 🔍 代码关键点

### 热切换逻辑
```typescript:apps/renderer/src/app/App.tsx
const restoreWorkspaceSnapshot = useCallback(async (
  snapshot: WorkspaceSnapshot | null,
  options: { killExisting: boolean; coldBoot: boolean }
) => {
  // ...existing setup...

  setWorkspace(snapshot.layout);

  // Hot switch mode: only update layout, keep existing tabs
  if (!options.coldBoot) {
    // Just switch layout, don't touch tabs or sessions
    setActiveTabId(resolveInitialActiveTabId(
      snapshot.layout.root,
      snapshot.layout.activePaneId
    ));
    return; // 🔑 关键：直接返回，不进行会话重建
  }

  // Cold boot mode: restore tabs according to restorePolicy
  // ...rebuild sessions...
}, []);
```

### 切换调用
```typescript:apps/renderer/src/app/App.tsx
const switchWorkspace = useCallback(async (workspaceId: string) => {
  await saveWorkspaceNow();
  const snapshot = await window.localtermApi.workspace.load({ id: workspaceId });
  // 🔑 关键：热切换模式
  await restoreWorkspaceSnapshot(snapshot, {
    killExisting: false,
    coldBoot: false
  });
}, []);
```

## 🧪 测试验证

### 手工验证步骤

1. **准备测试场景**
   ```bash
   pnpm dev
   # 创建 2-3 个本地终端 tab
   # 在每个终端运行持续输出命令
   tail -f /var/log/system.log  # macOS/Linux
   ping localhost               # 持续运行
   ```

2. **创建第二个 workspace**
   - 点击 "New Workspace"
   - 在新 workspace 中创建 2-3 个不同的终端

3. **验证热切换**
   - 切换回第一个 workspace
   - ✅ **预期**：所有终端仍在运行，输出持续追加
   - ❌ **旧版本**：所有终端重启，之前的输出丢失

4. **验证冷启动**
   - 关闭应用
   - 重新启动 `pnpm dev`
   - ✅ **预期**：根据 `restorePolicy` 重建会话

### 自动化测试（TODO）

```typescript
// tests/integration/workspace-hot-switch.test.ts
test("hot switch workspace preserves running sessions", async () => {
  // 1. Create workspace A with active sessions
  // 2. Switch to workspace B (hot switch)
  // 3. Verify workspace A sessions still running
  // 4. Switch back to workspace A
  // 5. Verify can send input to preserved sessions
});
```

## 📝 相关文件

| 文件 | 改动说明 |
|------|---------|
| `apps/renderer/src/app/App.tsx` | 核心逻辑修改 |
| `docs/WORKSPACE_HOT_SWITCH.md` | 本文档 |

## 🚀 未来优化方向

1. **会话池管理**：后台保留最近N个workspace的会话，快速恢复
2. **选择性恢复**：用户可配置哪些tab热保留，哪些冷重建
3. **会话快照**：切换时保存终端scrollback，恢复时显示历史输出
4. **智能预加载**：预测用户可能切换的workspace，提前准备会话

## ⚠️ 注意事项

1. **内存占用**：热切换会保留所有会话进程，需要监控内存使用
2. **会话泄漏**：确保在真正关闭workspace时正确清理会话（已有 `disposeTabs` 机制）
3. **Tab ID冲突**：不同workspace的tab ID必须全局唯一（当前已满足）

## ✅ 验收清单

- [x] 类型检查通过 `pnpm typecheck`
- [x] 所有 `restoreWorkspaceSnapshot` 调用已更新
- [x] 应用启动使用冷启动模式
- [x] 运行时切换使用热切换模式
- [x] 关闭workspace使用冷启动模式
- [ ] 手工验证热切换保留会话
- [ ] 手工验证冷启动重建会话
- [ ] 集成测试覆盖（后续补充）

---

**提交日期**: 2026-03-02
**实现者**: Claude + User
**影响范围**: workspace 切换逻辑
**向后兼容**: ✅ 完全兼容（只优化行为，不改schema）
