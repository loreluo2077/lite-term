# 项目架构（第一阶段）

## 范围

第一阶段只做本地终端（Local PTY），并且每个会话一个子进程。

不做 SSH / SFTP / shell integration / 终端体验增强功能。

## 进程模型

1. Electron Main（`apps/desktop`）
2. Renderer（`apps/renderer`）
3. Control Plane（`packages/control-plane`，运行在 Main 进程内）
4. Session Worker（`packages/session-worker`，每会话一个子进程）
5. Session Adapter（`packages/session-local`，当前仅 local）

## 职责边界

### `apps/desktop`

- 桌面壳：窗口、生命周期、IPC、preload
- 转发前端控制请求到 `control-plane`
- 不处理 `node-pty` 和终端字节流

### `apps/renderer`

- React UI（Tabs、终端容器、会话状态）
- 通过 preload 调控制面 API
- 连接每个会话 worker 的 WS（数据面）

### `packages/control-plane`

- 会话创建/销毁/resize/list
- 会话注册表、端口分配、worker 进程管理
- 不处理终端流数据解析

### `packages/session-worker`

- 每会话子进程统一入口
- 启动该会话专属 WS server
- 装配 session adapter（当前为 local）
- 上报 `ready/error/exit`

### `packages/session-core`

- `SessionAdapter` 标准接口
- 公共生命周期约束与错误处理工具

### `packages/session-local`

- `node-pty` 适配层
- 仅处理本地 shell 的 IO/resize/kill

## 控制面与数据面分离

### 控制面（IPC）

Renderer -> Preload -> Main -> Control Plane

用途：
- 创建会话
- 调整尺寸
- 销毁会话
- 列出会话（调试）

### 数据面（WS）

Renderer <-> Session Worker（每会话一条 WS）

用途：
- 终端输入输出字节流
- worker JSON 控制事件（ready / exit / error）

## 第一阶段目录结构（核心）

- `apps/desktop`
- `apps/renderer`
- `packages/shared`
- `packages/control-plane`
- `packages/session-worker`
- `packages/session-core`
- `packages/session-local`
- `packages/testkit`

## 第二阶段扩展位（提前预留）

- `packages/session-ssh`
- `packages/session-sftp`（是否需要再评估）
- shell integration 与命令追踪（前端 xterm addon）

