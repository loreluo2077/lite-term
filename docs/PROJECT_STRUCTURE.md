# 项目结构（文件级骨架说明）

本文件解释第一阶段目录树里“为什么有这些文件/目录”，以及后续新增文件时应放在哪里。

## 根目录

- `package.json`
  - workspace 顶层脚本占位（`dev` / `verify:quick` / `test:*`）
- `pnpm-workspace.yaml`
  - monorepo 工作区声明
- `tsconfig.base.json`
  - 全仓 TS 基础编译配置
- `README.md`
  - 项目定位、阶段目标、非目标

## `apps/desktop`（桌面壳）

### `src/main/index.ts`

- Electron 主进程启动入口（后续会调用 `app.whenReady()`）
- 只负责装配：窗口 + IPC

### `src/window/create-main-window.ts`

- `BrowserWindow` 创建与加载页面
- 不混会话创建逻辑

### `src/ipc/session-handlers.ts`

- IPC handler 到 `control-plane` 的映射层
- 约束：保持薄，不写业务逻辑

### `src/preload/index.ts`

- `contextBridge` 暴露安全 API 给 renderer
- 约束：仅暴露必要接口

### `src/preload/runtime.cjs`

- 当前开发期的 preload 运行时 shim（让 Electron 直接可加载）
- 作用：先接通链路，后续可合并回 TS 构建产物

## `apps/renderer`（前端 UI）

### `src/main.tsx`

- React 入口

### `src/app/App.tsx`

- 主应用壳（tabs + pane 布局）

### `src/components/TerminalPane.tsx`

- 单终端 pane 容器（后续会接 xterm）
- 约束：保持会话类型无关

### `src/lib/atoms/session.ts`

- Jotai session/tab 状态
- 约束：不存 xterm 实例本体

### `src/lib/session/connect-session-ws.ts`

- Renderer 数据面 WS 连接逻辑
- 约束：只负责连接与事件，不负责会话创建

## `packages/shared`（共享协议与类型）

### `src/schemas/control-plane.ts`

- IPC 控制面请求/响应 `zod` schema 与 TS 类型

### `src/schemas/session-events.ts`

- Worker 数据面 JSON 控制事件 `zod` schema 与 TS 类型

### `src/schemas/worker-ipc.ts`

- Main(control-plane) <-> worker 子进程内部 IPC schema

### `src/constants/session.ts`

- `SessionType`、`SessionStatus` 等常量

## `packages/control-plane`（控制面）

### `src/service/control-plane-service.ts`

- 供 Electron IPC 使用的统一服务入口

### `src/registry/session-registry.ts`

- 会话元数据存储（sessionId/pid/port/status）

### `src/port/port-allocator.ts`

- 端口分配与冲突重试（实现后）

### `src/worker/worker-process-manager.ts`

- session worker 进程的启动/停止/监听

## `packages/session-worker`（每会话子进程）

### `src/main.ts`

- 子进程通用入口
- 启动会话专属 WS
- 装配 adapter（第一阶段 local）

## `packages/session-core`（会话抽象）

### `src/session-adapter.ts`

- 会话统一接口定义（local/ssh 共用）

### `src/base-session-adapter.ts`

- 通用生命周期保护与基础行为

## `packages/session-local`（本地终端）

### `src/local-session-adapter.ts`

- `node-pty` 适配层
- 只处理本地 shell，会话框架逻辑不应写进来

## `packages/testkit`（测试工具）

- 放测试超时常量、shell fixture、清理工具、辅助断言
- 约束：供 unit/integration/e2e 共享，不依赖 Electron UI

## 新增文件放置规则（第一阶段）

1. 业务逻辑优先放 `packages/*`，不要塞进 `apps/desktop`
2. 协议字段变更先改 `packages/shared`
3. 任何和 worker 生命周期相关代码优先放 `control-plane` 或 `session-worker`
4. renderer 里不直接引入 `child_process` 或 Electron 主进程对象
