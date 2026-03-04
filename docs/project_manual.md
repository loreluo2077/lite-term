# Build with You: Lo-Fi Room 产品说明书

## 1. 产品概述

**产品名称**: Build with You: Lo-Fi Room  
**产品定位**: 个人与 AI Agent 的协作终端平台

Lo-Fi Room 聚焦多 agent 并行协作、多 workspace 切换、以及终端与工具视图的一体化操作体验。

## 2. 核心模型

- Workspace 放 Panel
- Panel 放 Tab
- Tab 放 Widget
- Session 仅属于 local terminal widget

这套模型的目标是：布局层稳定，内容层可扩展。

## 3. 当前已实现能力

### 3.1 Workspace

- 新建、切换、重命名、关闭、历史重开
- 自动保存与冷启动恢复
- 热切换保活（尽量不影响运行中的 terminal）

### 3.2 Panel / Tab

- 水平/垂直分割
- 分隔条尺寸调整
- Tab 拖拽移动与四向投放分屏
- Tab 重命名、关闭、右键菜单

### 3.3 Widget

当前内置：

- `terminal.local`
- `plugin.view:file.browser`
- `plugin.view:widget.markdown`

### 3.4 Session（Terminal Widget 专属）

- create / resize / kill / list
- 独立 worker 与独立 WS 端口
- startup scripts（延时执行）
- 断连可重连

## 4. 数据与兼容策略

workspace snapshot 当前采用迁移兼容方案：

- 新语义字段: `widget.kind/input`
- 兼容字段: `tabKind/input`

读路径兼容旧快照，写路径双写，避免历史 workspace 失效。

## 5. 文档入口

- 架构: `docs/project_architecture.md`
- 功能:
- `docs/project_feature/worksapce.md`
- `docs/project_feature/panel.md`
- `docs/project_feature/session.md`
- 测试实践: `docs/testing_playbook.md`
- 覆盖矩阵: `docs/testing_coverage_matrix.md`

## 6. 交付基线（测试）

从当前版本开始，新功能默认需要同时交付自动化测试：

- 至少 1 条 integration（逻辑/状态/存储）
- 至少 1 条 e2e（真实 UI 操作路径）

建议执行：

```bash
pnpm verify:quick
pnpm test:e2e
pnpm verify:ci
```
