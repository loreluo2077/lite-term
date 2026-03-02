# Workspace 热切换测试指南

## 🎯 测试目标

验证运行时切换 workspace 时会话保持活跃，不会被kill。

## 📋 测试步骤

### 1. 启动应用
```bash
cd C:/project/ai/lite-term
pnpm dev
```

### 2. 创建测试场景

#### Workspace A（默认）
1. 创建 3 个本地终端 tab
2. 在每个终端执行持续输出命令：

**Windows (PowerShell)**:
```powershell
# Tab 1
while ($true) { Get-Date; Start-Sleep -Seconds 1 }

# Tab 2
ping localhost -t

# Tab 3
Get-Process | Format-Table -AutoSize; Start-Sleep -Seconds 2
```

**Linux/macOS (bash)**:
```bash
# Tab 1
while true; do date; sleep 1; done

# Tab 2
ping localhost

# Tab 3
while true; do ps aux | head -20; sleep 2; done
```

3. 记录每个终端的最新输出（比如时间戳）

### 3. 创建 Workspace B

1. 点击 **"New Workspace"** 按钮
2. 系统会创建新的空 workspace 并切换过去
3. 在新 workspace 中创建 2 个终端：

```bash
# Tab 1
echo "This is Workspace B - Tab 1"

# Tab 2
echo "This is Workspace B - Tab 2"
```

### 4. 验证热切换（关键测试）

#### 4.1 切换回 Workspace A
1. 打开 workspace 管理器（点击 workspace 名称）
2. 选择 "Default Workspace"（或你之前的 workspace 名称）
3. 点击切换

#### 4.2 验证会话保留 ✅
**预期结果**：
- ✅ 所有 3 个终端仍在运行
- ✅ 时间戳持续更新（说明进程未重启）
- ✅ 输出没有中断或重置
- ✅ Tab 标题和状态保持不变

**旧版本行为（已修复）**：
- ❌ 所有终端重新启动
- ❌ 之前的输出丢失
- ❌ 看到 "starting..." → "ready" 的状态切换

#### 4.3 验证输入仍然有效
1. 在任意一个终端按 `Ctrl+C` 停止命令
2. 输入新命令 `echo "Hot switch works!"`
3. ✅ 预期：命令执行成功

### 5. 验证多次切换

重复以下操作 3-5 次：
1. 切换到 Workspace B
2. 切换回 Workspace A
3. ✅ 每次切换后，Workspace A 的终端仍在运行

### 6. 验证冷启动（对比场景）

#### 6.1 关闭当前 workspace
1. 打开 workspace 管理器
2. 点击当前 workspace 的删除按钮（或关闭按钮）
3. 系统会切换到另一个 workspace

#### 6.2 验证会话重建 ✅
**预期结果**：
- ✅ 如果 `restorePolicy: "recreate"`，会话被重新创建
- ✅ 终端是全新的（无历史输出）
- ✅ 看到 "starting..." → "ready" 状态变化

### 7. 验证应用重启（冷启动）

1. 关闭整个应用（关闭窗口或 Ctrl+C）
2. 重新运行 `pnpm dev`
3. ✅ 预期：根据最后保存的 workspace 恢复布局
4. ✅ 预期：根据每个 tab 的 `restorePolicy` 决定是否重建会话

## 📊 测试矩阵

| 场景 | killExisting | coldBoot | 会话行为 | 验证方法 |
|------|-------------|----------|----------|---------|
| **热切换** | false | false | 保留 | 时间戳连续 |
| **关闭workspace** | true | true | 重建 | 输出清空 |
| **应用重启** | false | true | 按策略 | 看 restorePolicy |
| **创建空workspace** | true | true | 无会话 | 空布局 |

## 🐛 常见问题排查

### 问题1: 切换后终端无响应
**可能原因**: WebSocket 连接未正确保持
**排查步骤**:
1. 打开 DevTools (F12)
2. 查看 Console 是否有连接错误
3. 检查 Network 面板 WebSocket 连接状态

### 问题2: 切换后看到"重新连接"
**说明**: 这是旧版本行为，说明热切换未生效
**排查步骤**:
1. 确认代码已更新到最新版本
2. 运行 `pnpm typecheck` 确保编译正确
3. 重新 `pnpm dev` 启动

### 问题3: 内存占用持续增长
**说明**: 会话未正确清理
**排查步骤**:
1. 运行 `pnpm debug:sessions` 查看活跃会话
2. 切换workspace后再次运行，确认会话数量合理
3. 运行 `pnpm kill:orphans` 清理孤儿进程

## 📸 截图建议

测试时可以截图记录：
1. **切换前**：Workspace A 终端时间戳 `14:30:45`
2. **切换到B**：Workspace B 界面
3. **切换回A**：Workspace A 终端时间戳 `14:30:53`（证明未重启）

## ✅ 验收标准

- [ ] 热切换后终端输出连续（无重启）
- [ ] 热切换后可以继续输入命令
- [ ] 多次切换后会话仍然活跃
- [ ] 关闭workspace后会话被清理
- [ ] 应用重启后根据策略恢复
- [ ] 无内存泄漏（会话正确清理）

## 🎉 预期体验

**完美的热切换体验**：
- 切换 workspace 就像切换标签页一样快
- 所有工作状态完整保留
- 用户感觉不到任何"重启"或"重连"
- 像在不同的虚拟桌面间切换，而不是重建环境

---

**测试完成后**，请在 [WORKSPACE_HOT_SWITCH.md](../docs/WORKSPACE_HOT_SWITCH.md) 的验收清单中打钩 ✅
