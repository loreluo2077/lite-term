# 测试约束（第一阶段）

目标：确保“每会话一个子进程”的主链路可被自动化快速验证，并避免后续测试脆弱化。

## 1. 测试分层

### Unit（快速）

覆盖范围：
- `packages/shared` schema / 类型辅助
- `packages/control-plane` 纯逻辑（registry、状态流）
- `packages/session-core` 生命周期约束

要求：
- 无 Electron 依赖
- 无真实 `node-pty` 依赖（使用 fake adapter）

### Integration（核心）

覆盖范围：
- `control-plane` + `session-worker` + `session-local` 联动
- 真实子进程创建、回收
- 真实 WS 数据面链路

必须覆盖：
1. create local session
2. connect WS
3. send input and assert output marker
4. resize
5. kill
6. assert worker exit and registry cleanup

### E2E（低频）

覆盖范围：
- Electron + preload + renderer wiring
- 最少 1 条新建终端主路径

## 2. 快速验证标准（`verify:quick`）

`verify:quick` 是日常最高频命令，必须在 30~90 秒内完成（目标值，视机器与 CI 浮动）。

应包含：
- `typecheck`
- `lint`
- 关键 smoke integration（至少 1 条本地终端链路）

不应包含：
- 完整 E2E
- 全量并发压力测试

## 3. 子进程测试约束（必须）

每个涉及会话创建的测试必须验证以下事实：

1. 有 worker pid
2. 有唯一 sessionId
3. 有监听端口
4. 退出后 registry 中不存在该 session
5. 测试结束时无遗留 worker 进程

## 4. 终端输出断言约束

禁止把整段终端原始输出做 snapshot 主断言（会被 shell 提示符、ANSI、平台差异污染）。

推荐做法：
- 使用固定 marker，例如 `__LT_READY__`
- 断言包含 marker
- 断言控制事件顺序（`ready` -> `exit`）

## 5. Shell 选择约束（测试稳定性）

为了稳定测试，优先使用可控 shell：

- macOS / Linux：`bash --noprofile --norc`
- zsh 备选：`zsh -f`

要求：
- 不依赖用户 shell 配置文件
- 不依赖颜色 prompt
- 不依赖 alias / plugin

## 6. 超时与重试规范

- 测试超时常量统一放在 `packages/testkit`
- 禁止在测试中散落魔法数字超时
- 仅允许对已知异步抖动点做有限重试（需注释原因）

## 7. 日志与排障

worker 必须支持测试模式日志（可降噪但保留关键事件）：
- `spawn`
- `ready`
- `error`
- `exit`

测试失败时应输出：
- sessionId
- worker pid
- worker port
- 最近控制事件

## 8. 原生模块前置条件（本地开发）

第一阶段本地终端依赖 `node-pty`。在某些环境（尤其使用 PNPM 10 且默认拦截构建脚本）下，需要手动确保原生模块已编译。

最低要求：
- `node-pty` 可成功加载 `pty.node`
- 本地 shell 可由 `node-pty.spawn(...)` 拉起

建议把这一步纳入本地初始化文档与 CI 镜像准备。
## 9. CI 最低门槛（第一阶段）

合并前至少通过：
- unit
- integration

E2E 可以先设为非阻塞，但要能手动执行并持续维护。
