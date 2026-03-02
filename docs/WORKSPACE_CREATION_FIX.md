# Workspace Creation Fix

## 📋 问题描述

**用户报告**：创建新 workspace 时会影响现有的 workspace：
1. 新创建的 workspace 没有自动刷新处理
2. 会导致现有的 workspace 重新创建（sessions 被销毁）

## 🔍 根本原因分析

### 问题：创建新 workspace 时使用了冷启动模式

**位置**：`apps/renderer/src/app/App.tsx` 第 764-773 行

**原始代码**：
```typescript
await restoreWorkspaceSnapshot(
  {
    layout: {
      ...createDefaultWorkspaceLayout(now),
      id,
      name
    },
    tabs: []
  },
  { killExisting: true, coldBoot: true }  // 🔥 错误：销毁现有 sessions！
);
```

**问题链**：
1. 创建新 workspace 时，`createEmptyWorkspace` 函数调用了 `restoreWorkspaceSnapshot`
2. 使用了 `{ killExisting: true, coldBoot: true }` 参数
3. 这导致所有现有的 sessions 被销毁 (`disposeTabs` 被调用)
4. 现有的终端会话全部关闭，用户体验差

**对比**：`switchWorkspace` 函数正确地使用了热切换模式：
```typescript
await restoreWorkspaceSnapshot(snapshot, { killExisting: false, coldBoot: false });
```

## ✅ 解决方案

### 修复：创建新 workspace 时使用热切换模式

```typescript
await restoreWorkspaceSnapshot(
  {
    layout: {
      ...createDefaultWorkspaceLayout(now),
      id,
      name
    },
    tabs: []
  },
  { killExisting: false, coldBoot: false }  // ✅ 正确：保持现有 sessions
);
```

### 效果：
- ✅ 新 workspace 创建时不会影响现有 sessions
- ✅ 现有 workspace 的终端会话保持运行
- ✅ 新 workspace 为空白布局（符合预期）
- ✅ 用户可以在 workspaces 间自由切换，sessions 持续运行

## 📊 修复前后对比

### Before（创建新 workspace 影响现有）
```
用户操作：
  1. Workspace A 中有 3 个终端在运行
  2. 点击 "New Workspace" 创建 Workspace B

系统行为：
  3. 调用 restoreWorkspaceSnapshot({killExisting: true, coldBoot: true}) ❌
  4. 所有现有 sessions 被销毁 ❌
  5. Workspace A 的终端全部关闭 ❌

结果：
  - Workspace A 中的终端全部断开连接
  - 需要重新创建所有终端会话
  - 用户工作流程被打断
```

### After（创建新 workspace 不影响现有）
```
用户操作：
  1. Workspace A 中有 3 个终端在运行
  2. 点击 "New Workspace" 创建 Workspace B

系统行为：
  3. 调用 restoreWorkspaceSnapshot({killExisting: false, coldBoot: false}) ✅
  4. 现有 sessions 保持运行 ✅
  5. 只切换到新的空白布局 ✅
  6. 旧 workspace 的 tabs 成为 orphan tabs 继续运行 ✅

结果：
  - Workspace B 为空白工作区（符合预期）
  - Workspace A 的终端继续运行
  - 可以随时切回 Workspace A 继续工作
  - 完美的多 workspace 体验
```

## 🧪 测试验证

### 自动化测试
```bash
pnpm typecheck  # ✅ All packages passed
npx tsx --test tests/integration/workspace-storage.test.ts tests/integration/workspace-order.test.ts  # ✅ All passed
```

### 手工验证步骤

1. **准备场景**
   ```bash
   pnpm dev
   # 在 Workspace 中创建几个终端
   # 让终端运行持续输出命令
   while true; do date; sleep 1; done
   ```

2. **验证新 workspace 创建不影响现有**
   - 点击 "+" 按钮 → "New Workspace"
   - 观察原有终端是否继续运行
   - ✅ 预期：原有终端继续运行，时间戳连续

3. **验证新 workspace 为空**
   - 新 workspace 应该是空白布局
   - ✅ 预期：没有终端，干净的工作区

4. **验证 workspace 切换**
   - 在新旧 workspace 间切换
   - ✅ 预期：原有终端保持运行状态

## 🔍 相关代码位置

| 文件 | 行号 | 改动 |
|------|------|------|
| `apps/renderer/src/app/App.tsx` | 764-773 | 修改 createEmptyWorkspace 为热切换模式 |

## 💡 设计改进

### 一致的 Workspace 行为
- **创建新 workspace**：热切换，保持现有 sessions
- **切换 workspace**：热切换，保持现有 sessions
- **关闭当前 workspace**：冷启动，清理相关 sessions
- **应用启动**：冷启动，根据 restorePolicy 恢复 sessions

### 用户体验提升
- 创建新 workspace 不会中断现有工作
- 支持真正的多 workspace 并行工作
- 会话生命周期管理更加合理

## ⚠️ 注意事项

1. **内存占用**：创建多个 workspaces 时，之前的 sessions 会作为 orphan tabs 保留在后台
2. **清理机制**：关闭应用时会统一清理所有 sessions（已有机制）
3. **性能考虑**：大量后台 sessions 可能影响性能，建议适时清理

---

**问题报告日期**: 2026-03-02
**根本原因**: createEmptyWorkspace 使用了冷启动模式
**解决方案**: 改为热切换模式，保持现有 sessions
**影响范围**: Workspace 创建、Session 生命周期
**向后兼容**: ✅ 完全兼容（只优化行为）