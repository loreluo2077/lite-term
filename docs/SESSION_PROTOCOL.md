# 会话协议（第一阶段草案）

第一阶段协议目标：简单、稳定、可测试。

## 1. 控制面协议（Renderer <-> Main IPC）

采用 `ipcRenderer.invoke` / `ipcMain.handle` 的请求-响应形式。

### `session:createLocal`

请求（草案）：

```ts
{
  sessionType: "local",
  cols: number,
  rows: number,
  shell?: string,
  cwd?: string,
  env?: Record<string, string>
}
```

响应（草案）：

```ts
{
  sessionId: string,
  port: number,
  pid: number,
  status: "starting" | "ready"
}
```

### `session:resize`

请求：

```ts
{
  sessionId: string,
  cols: number,
  rows: number
}
```

响应：

```ts
{ ok: true }
```

### `session:kill`

请求：

```ts
{ sessionId: string }
```

响应：

```ts
{ ok: true }
```

### `session:list`（调试）

响应：

```ts
{
  sessions: Array<{
    sessionId: string,
    pid: number,
    port: number,
    status: "starting" | "ready" | "exited" | "error"
  }>
}
```

## 2. 数据面协议（Renderer <-> Session Worker WebSocket）

## 2.1 数据通道原则

- 终端输出：优先二进制帧（`ArrayBuffer` / `Uint8Array`）
- 终端输入：文本优先（后续允许二进制）
- 控制事件：JSON 字符串帧（类型区分）

## 2.2 Worker -> Renderer 控制事件（JSON）

```ts
type SessionWorkerControlEvent =
  | { type: "ready"; sessionId: string; pid: number; port: number }
  | { type: "exit"; sessionId: string; exitCode: number | null; signal?: string }
  | { type: "error"; sessionId: string; message: string; code?: string };
```

约束：
- `ready` 最多发送一次
- `exit` 最多发送一次
- `error` 可多次发送，但 fatal error 后应尽快进入 `exit`

## 2.3 Renderer -> Worker 控制事件（暂不走 WS）

第一阶段 `resize/kill` 走控制面 IPC，由 `control-plane` 转发给 worker。

说明：
- 这样便于测试会话生命周期和权限边界
- 后续如需优化交互延迟，可再评估部分控制消息直连 WS

## 3. 错误与状态约束

### 状态流（worker 视角）

`starting -> ready -> exited`

异常路径：

`starting -> error -> exited`

### 错误处理原则

- 错误消息必须包含可读 `message`
- 不把完整堆栈直接暴露到用户 UI（可写入 worker 日志）
- 协议字段变更必须同步更新 `packages/shared`

## 4. Schema 落地状态（已完成基础版）

本文件中的核心协议已落地到 `packages/shared`：

- `packages/shared/src/schemas/control-plane.ts`
- `packages/shared/src/schemas/session-events.ts`
- `packages/shared/src/schemas/worker-ipc.ts`

当前约束：

- IPC handler 入站由 `control-plane` 服务调用前校验
- worker <-> parent IPC 由 `session-worker` 与 `control-plane` 双侧校验
- renderer 消费 worker JSON 控制事件时做 `zod` 校验

后续增强（第二阶段）：

- 增加错误码枚举 schema
- 增加 WS 数据面可选控制消息（若引入）
