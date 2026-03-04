## 项目架构

本文档基于当前实现说明系统分层、核心模型与数据流。

## 1. 技术栈

- 桌面容器: Electron
- 渲染层: React + Vite + Jotai + xterm.js
- 会话执行: node-pty + 独立 session-worker
- 协议与校验: Zod（`@localterm/shared`）
- Monorepo: pnpm workspace + TypeScript

## 2. 领域模型（当前统一定义）

- `Workspace` 放 `Panel`
- `Panel` 放 `Tab`
- `Tab` 放 `Widget`
- `Session` 是 `terminal.local widget` 的运行时资源，不是通用 Tab 资源

说明：

- `Tab` 负责布局、标题、激活、拖拽、关闭等容器能力
- `Widget` 负责具体内容渲染与交互（terminal / file browser / markdown）

## 3. 代码分层

### 3.1 应用层

- `apps/desktop`: Electron 主进程、preload、IPC、workspace 存储
- `apps/renderer`: UI、pane-tree、tab 容器、widget 渲染、会话连接

### 3.2 核心包层

- `packages/shared`: 跨进程 schema、类型、常量
- `packages/control-plane`: 会话控制平面（create/resize/kill/list）
- `packages/session-worker`: 每会话独立 worker（WS server + adapter 桥接）
- `packages/session-local`: 本地 shell adapter（node-pty）
- `packages/session-core`: session adapter 抽象

## 4. 核心数据流

### 4.1 启动与恢复

1. desktop 注册 IPC 并启动窗口
2. renderer 调用 `workspace.getDefault + workspace.list`
3. 按快照恢复 layout 和 tab/widget
4. 冷启动时按 `restorePolicy` 决定是否重建 terminal session

### 4.2 Terminal Widget 会话创建

1. renderer 为 terminal widget 调用 `session:createLocal`
2. control-plane 分配端口并启动 session-worker
3. worker 启动 pty + WS server
4. TerminalPane 连接 `ws://127.0.0.1:<port>`，进入双向流

### 4.3 Workspace 持久化

1. renderer 更新内存态 `workspace + tabs`
2. 防抖保存为 snapshot
3. desktop 写入 `workspace-store/workspaces/<id>.json`
4. `index.json` 维护顺序、名称、关闭状态与访问时间

## 5. 迁移状态（tab -> widget 语义收敛）

当前采用兼容策略：

- 运行态与渲染逻辑以 `tab.widget.kind/input` 为主
- 持久化仍保留 legacy 字段 `tabKind/input`
- snapshot 读路径支持：
- 新格式（含 `widget`）
- 旧格式（仅 `tabKind/input`，读取时自动映射为 widget）

这样可以保证历史 workspace 快照可继续加载。

## 6. 关键设计点

- 控制平面与数据平面分离
- 一会话一 worker 隔离
- workspace 热切换保持运行态（orphan tab 隐藏保活）
- session 生命周期仅挂在 local terminal widget

## 7. 扩展点

- 新 Widget 类型：
- 扩展 `WidgetDescriptor` / `tabKind` 映射
- 实现对应渲染组件与 driver
- 新会话类型：
- 在 session adapter 层扩展（如 ssh），再接入对应 widget

## 8. 测试与运维

- 集成测试: workspace schema/storage/order、pane-tree、local session smoke
- 脚本:
- `pnpm debug:sessions`
- `pnpm kill:orphans`
- `pnpm perf:stress`
