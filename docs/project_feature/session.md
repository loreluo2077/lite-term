## Session 功能说明

## 1. 当前支持范围

当前仅实现 `terminal.local`（本地 shell 会话）。

- 会话类型: `local`
- 每个会话独立 worker 进程
- 每个会话独立 WebSocket 端口

## 2. 架构分层

### 2.1 控制平面（Control Plane）

- 入口: `packages/control-plane`
- 能力: `createLocalSession / resizeSession / killSession / listSessions`
- 由 Electron IPC handler 调用

### 2.2 会话执行层（Worker + Adapter）

- `session-worker`: 接收父进程消息，创建 WS server，转发输入输出
- `session-local`: 基于 node-pty 的本地 shell 适配器
- `session-core`: adapter 生命周期抽象

### 2.3 渲染层（Renderer）

- `TerminalPane` 创建 xterm 实例
- 通过 `connectSessionWebSocket` 与 worker 通信
- 将用户输入写回会话，将输出流渲染到终端

## 3. 生命周期与状态

会话状态：

- `starting`
- `ready`
- `exited`
- `error`

关键事件：

- worker -> renderer: `ready | exit | error`（JSON 控制事件）
- 普通终端输出走文本/二进制消息

## 4. 已实现功能

### 4.1 创建/销毁/调整尺寸

- 新建 terminal tab 时调用 `session:createLocal`
- pane 尺寸变化与聚焦时会同步发送 `resizeSession`
- 关闭 tab 或明确 kill 时释放会话

### 4.2 WebSocket 连接与重连

- `TerminalPane` 在拿到端口后连接 ws
- 若非主动关闭且会话未退出，会自动重连
- worker 允许“断连不杀进程”，支持稍后重连

### 4.3 启动脚本（Startup Scripts）

- 可为 terminal 配置多条启动命令（含 delayMs）
- 会话 ready 后按配置延时执行
- 已执行脚本按 `sessionKey(tabId:sessionId)` 去重，避免重复触发
- workspace 热切换回来可触发重跑逻辑（有脚本的 terminal）

### 4.4 性能与调试面板

Perf Panel：

- 总输出字节/行数/实时吞吐
- renderer/main/worker 内存采样

Debug Sessions：

- 查看 control-plane registry 列表

## 5. 会话隔离与稳定性策略

- 一会话一 worker，避免互相污染
- 端口分配器维护 pending 集合，减少并发冲突
- worker 无客户端时缓存有限输出（上限 256KB），防止内存无限增长

shell 环境清洗：

- 去除泄漏的 `NODE_OPTIONS --import tsx`
- 去除 `ELECTRON_RUN_AS_NODE`

## 6. 当前限制

- `terminal.ssh` 仅有 noop driver，未接入真实实现
- 暂无会话级权限控制与审计
- 暂未实现“会话历史回放”持久化（输出仅在运行期内存与终端缓冲中）
