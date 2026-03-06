## 项目架构

本文档基于当前实现说明系统分层、核心模型与数据流。

## 1. 技术栈

- 桌面容器: Electron
- 渲染层: React + Vite + Jotai + xterm.js + webview widget runtime
- 会话执行: node-pty + `widget-terminal` worker
- 协议与校验: Zod（`@localterm/shared`）
- Monorepo: pnpm workspace + TypeScript

## 2. 领域模型（当前统一定义）

- `Workspace` 放 `Panel`
- `Panel` 放 `Tab`
- `Tab` 放 `Widget`
- `Session` 是 `extension terminal`（builtin `terminal.local` webview widget）的运行时资源，不是通用 Tab 资源

说明：

- `Tab` 负责布局、标题、激活、拖拽、关闭等容器能力
- `Widget` 负责具体内容渲染与交互（terminal / file browser / markdown）

## 3. 代码分层

### 3.1 应用层

- `apps/desktop`: Electron 主进程、preload、IPC、workspace 存储
- `apps/renderer`: UI、pane-tree、tab 容器、widget 渲染、会话连接
- `apps/renderer/src/lib/widgets`: widget runtime state、widget drivers
- `apps/renderer/src/components/widgets`: widget 组件（extension widget）

### 3.2 核心包层

- `packages/shared/src/schemas/base`: 基础协议（control-plane / worker-ipc / session-events / fs / metrics）
- `packages/shared/src/schemas/widget`: widget 协议（widget descriptor + tab descriptor）
- `packages/shared/src/schemas/plugin`: extension 协议（manifest / rpc）
- `packages/shared/src/schemas/workspace`: workspace 协议（layout + snapshot）
- `packages/control-plane/src/port` + `src/registry`: base 控制平面能力
- `packages/control-plane/src/widgets/local-terminal`: local terminal widget 控制逻辑
- `packages/widget-terminal/src/base`: session adapter 抽象（base）
- `packages/widget-terminal/src/local-terminal`: local terminal worker + adapter（node-pty）

## 4. 核心数据流

### 4.1 启动与恢复

1. desktop 注册 IPC 并启动窗口
2. renderer 调用 `workspace.getDefault + workspace.list`
3. 按快照恢复 layout 和 tab/widget
4. 冷启动时按 `restorePolicy` 决定是否重建 terminal session

### 4.2 Terminal Widget 会话创建

1. terminal webview 通过 `widgetApi.terminal.create` 请求创建会话
2. control-plane 分配端口并启动 session-worker
3. worker 启动 pty + WS server
4. `extensions/builtin.workspace/widgets/terminal.local/main.js` 连接 `ws://127.0.0.1:<port>`，进入双向流

### 4.3 Workspace 持久化

1. renderer 更新内存态 `workspace + tabs`
2. 防抖保存为 snapshot
3. desktop 写入 `workspace-store/workspaces/<id>.json`
4. `index.json` 维护顺序、名称、关闭状态与访问时间

### 4.4 Extension Widget Webview 流

1. desktop 注册 `localterm-extension://` 协议
2. renderer 的 `PluginWidgetPane` 创建 `<webview src="localterm-extension://...">`
3. webview preload (`widget-webview.cjs`) 注入 `window.widgetApi`
4. widget 页面通过 `widgetApi` 请求宿主能力（state/workspace/fs/widget/terminal）
5. renderer 处理 `widget-api-request` 并返回 `widget-api-response`
6. widget state 变更通过 `widget-host-event(state.changed)` 回推

## 5. 当前协议状态

- 运行态与渲染逻辑统一使用 `tab.widget.kind/input`
- 运行态主字段统一为 `widgetKind`
- 内置 widget：`terminal.local` / `file.browser` / `note.markdown`
- 外部 widget：`extension.widget`（`extensionId + widgetId + state`）
- file/note 由 builtin extension 的 webview 页面提供（`extensions/builtin.workspace/widgets/*`）
- terminal 通过 builtin extension 的 `terminal.local` webview + `widgetApi.terminal.*` 驱动
- workspace snapshot：仅 `schemaVersion=3` + 纯 `widget` 描述
- extension manifest：仅 `manifestVersion=2` + `widgetKinds`
- extension widget input：仅 `extensionId + widgetId + state`

## 6. 关键设计点

- 控制平面与数据平面分离
- 一会话一 worker 隔离
- workspace 热切换保持运行态（orphan tab 隐藏保活）
- session 生命周期仅挂在 extension terminal widget

## 7. 扩展点

- 新 Widget 类型：
- 扩展 `WidgetDescriptor`
- 实现对应渲染组件与 driver
- 新会话类型：
- 在 session adapter 层扩展（如 ssh），再接入对应 widget

## 8. 测试与运维

- 集成测试: workspace schema/storage/order、pane-tree、local session smoke
- 脚本:
- `pnpm debug:sessions`
- `pnpm kill:orphans`
- `pnpm perf:stress`
