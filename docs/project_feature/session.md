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

## 7. 自动化测试

- 已覆盖（集成测试）:
- `tests/integration/local-session.test.ts`
- 覆盖会话创建、WS 连接、输出、resize、kill、延迟连接、唯一 pid/port、registry 快照
- 辅助能力:
- `packages/testkit/src/index.ts` 提供稳定 shell 参数与输出等待工具
- 执行命令:
- `pnpm test`
- `pnpm verify:quick`
- 诊断脚本:
- `pnpm debug:sessions`
- `pnpm kill:orphans`
- `pnpm perf:stress`

## 8. UI测试

- 基础链路:
- 新建 terminal tab，确认状态从 `starting` 到 `ready`
- 输入命令并校验输出，关闭 tab 后会话应退出
- 连接稳定性:
- 触发 workspace 热切换，再切回原 workspace，确认终端仍可输入输出
- 暂时断开连接后恢复页面，确认可重连
- 启动脚本:
- 为 terminal 配置多条 startup script（不同 delay）
- 新建会话后确认脚本按预期执行且不重复执行
- 性能面板:
- 打开 Perf Panel，确认吞吐与内存采样正常更新

## 9. 人类验收

- 验收标准:
- 会话可稳定创建、交互、销毁，无僵尸进程残留
- 多会话并发时不存在端口冲突或会话串线
- 热切换场景下会话连续性符合预期
- Startup Scripts 在新建与恢复场景下行为一致
- 性能与调试面板可用于定位问题
