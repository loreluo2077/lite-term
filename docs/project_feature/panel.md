## Panel 功能说明

## 1. 定义

Panel 是 Workspace 内的布局单元。当前实现基于二叉树结构：

- `leaf` 节点: 真实可见的面板，包含 `tabIds` 和 `activeTabId`
- `split` 节点: 分割容器，包含方向、两个子节点和尺寸比例 `sizes`

Panel 只负责“布局与 tab 容器能力”，不直接关心 tab 内部具体业务。

## 2. 数据结构约束

- 分割方向: `horizontal | vertical`
- `sizes` 必须是两个正数，且和为 1（schema 校验）
- 不允许关闭最后一个 pane（至少保留一个可见 pane）
- 关闭 pane 时，被关闭 pane 内的 tabs 会迁移到兄弟 pane

对应 schema 与实现：

- `packages/shared/src/schemas/workspace.ts`
- `apps/renderer/src/lib/workspace/pane-tree.ts`

## 3. 已实现交互

### 3.1 分割与关闭

- `Split H`: 水平分割当前 pane
- `Split V`: 垂直分割当前 pane
- `Close`: 关闭当前 pane（仅当 pane 数 > 1）

### 3.2 尺寸调整

- 基于 `react-resizable-panels`
- 拖动分隔条后会回写 `sizes` 到 workspace 状态
- 调整结果会进入 workspace 自动保存

### 3.3 活跃 pane 管理

- 点击 pane 区域可设为 active pane
- active pane 有高亮边框
- 新建 tab 默认进入 active pane（也可指定目标 pane）

### 3.4 Tab 容器能力

- 每个 pane 有自己的 tab 列表与当前激活 tab
- tab 支持双击重命名
- 支持 tab 右键菜单（重命名、关闭、移动到新 split、terminal 启动脚本入口）

### 3.5 拖拽投放

tab 支持拖拽到任意 pane，投放区域包含：

- `center`: 只移动 tab 到目标 pane
- `left/right/top/bottom`: 先分割目标 pane，再把 tab 放到新 pane

拖拽中会显示区域预览层。

## 4. 空态与可用性

- 空 pane 显示 `New Terminal In Pane` 快捷入口

pane 头部快捷按钮：

- `+Term`
- `+File`
- `+Note`
- `Split H/V`
- `Close`

## 5. 持久化行为

- pane tree、activePaneId、sizes 全部属于 workspace layout
- 通过 workspace autosave 持久化
- 重启后按 workspace 快照恢复布局

## 6. 当前限制

- 浮动 panel（overlays.floatingPanels）schema 已定义，UI 尚未实现
- 暂无 pane 级快捷键（当前主要通过按钮和右键菜单操作）
