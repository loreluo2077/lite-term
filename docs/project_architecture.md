## 项目架构

本文档基于当前代码实现（`apps/*` + `packages/*`）总结系统结构、数据流和扩展点。

## 1. 技术选型

- 桌面容器: Electron
- 前端渲染: React 18 + Vite + Jotai + react-resizable-panels
- 终端渲染: xterm.js（含 fit/search/webgl/canvas fallback 等 addon）
- 进程与会话: Node.js child process + `@homebridge/node-pty-prebuilt-multiarch`
- 本地数据校验: Zod（统一在 `@localterm/shared` 中定义 schema）
- 包管理与 monorepo: pnpm workspace + TypeScript

## 2. 仓库与模块拆分

### 2.1 应用层

- `apps/desktop`: Electron 主进程 + preload + IPC handler
- `apps/renderer`: React UI，包含 workspace/panel/tab/plugin 交互

### 2.2 核心包层

- `packages/shared`: 跨进程共享协议、schema、类型、常量
- `packages/control-plane`: 会话控制平面（创建/销毁/resize/list）
- `packages/session-worker`: 每个会话对应的 worker 入口，负责 WS + adapter 桥接
- `packages/session-local`: 本地 shell 的 pty adapter
- `packages/session-core`: session adapter 抽象基类
- `packages/testkit`: 集成测试辅助工具

## 3. 关键数据流

### 3.1 应用启动流

1. `desktop` 启动后注册 IPC（session/workspace/file）
2. 创建 BrowserWindow，加载 renderer
3. renderer 启动后调用 `workspace.getDefault + workspace.list`
4. 根据快照恢复布局与 tab（cold boot）

### 3.2 会话创建流（terminal.local）

1. renderer 通过 preload 调用 `session:createLocal`
2. `control-plane` 分配端口并生成 sessionId
3. `worker-process-manager` 拉起独立 session-worker 子进程
4. worker 创建 WebSocketServer + LocalSessionAdapter(node-pty)
5. renderer `TerminalPane` 连接 `ws://127.0.0.1:<port>` 并开始双向流转

### 3.3 工作空间数据流

1. UI 操作更新 Jotai 中的 `workspace + tabs`
2. 防抖自动保存为 `WorkspaceSnapshot`（layout + tab descriptors）
3. desktop 写入 `userData/workspace-store/workspaces/<id>.json`
4. `index.json` 维护 workspace 元信息（顺序、closed 状态、最近访问时间）

## 4. 核心设计点

### 4.1 控制平面与数据平面分离

- 控制平面: Electron IPC + ControlPlaneService（创建/resize/kill/list）
- 数据平面: TerminalPane <-> session-worker WebSocket（输入输出流）

### 4.2 一会话一 worker 隔离

- 每个 terminal session 独立进程、独立端口、独立 PID
- 降低单个会话异常对其他会话的影响

### 4.3 Workspace 热切换

- 切换 workspace 默认 `killExisting=false`（热切换）
- 不在当前布局中的 tab 作为 orphan 保留在隐藏容器中，连接不断开
- 因此切换回来时可继续使用原会话，不重启

### 4.4 restorePolicy

- `recreate`: 冷启动时重建运行态资源（主要是 local terminal）
- `manual`: 仅恢复 tab 描述，不自动重建资源（如 plugin.view）

## 5. 状态与持久化模型

### 5.1 运行态（内存）

- `tabsAtom`: tab 列表、session 信息、连接状态
- `currentWorkspaceAtom`: pane tree + activePaneId + overlays

### 5.2 持久化态（磁盘）

- workspace snapshot: 完整布局与 tabs 描述
- workspace index: 顺序、名称、isClosed、lastAccessed

## 6. 扩展点

### 6.1 新 tab 类型

- 在 `tab-descriptor` 增加 `tabKind`
- 实现对应 `TabDriver` 并注册到 `tab-drivers/registry`
- 增加 renderer 里的实际渲染组件

### 6.2 插件视图

当前内置 `builtin.workspace` 包含以下视图：

- `file.browser`
- `widget.markdown`

- 后续可扩展为外部 plugin manifest + permissions + rpc

### 6.3 新会话类型

- 当前仅 `local`
- 可按 `session-core` adapter 接口新增 `ssh` 等实现
- worker 层可复用同一套消息协议

## 7. 测试与运维脚本

- 集成测试: workspace schema/storage/order、pane-tree、local session smoke

调试脚本：

- `pnpm debug:sessions`: 查看 registry 快照与 worker 进程
- `pnpm kill:orphans`: 清理孤儿 session-worker
- `pnpm perf:stress`: 会话压力测试
