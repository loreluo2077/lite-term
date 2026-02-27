# 验收清单（electerm 迁移功能）

本文用于验收 `localterm` 第一阶段从 `electerm` 迁移过来的核心能力。

参考映射文档：
- `/Users/a1/Documents/ai/war-room/localterm/docs/REUSE_MAP.md`
- `/Users/a1/Documents/ai/war-room/localterm/docs/XTERM_PARITY.md`

## A. 自动化验收（可脚本/测试）

### A1. 控制面/会话链路可用（create -> ws -> input/output -> resize -> kill）

- 覆盖来源（electerm）：
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-process.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-server.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-local.js`
- 自动化方式：
  - `pnpm test:integration`
- 对应测试：
  - `/Users/a1/Documents/ai/war-room/localterm/tests/integration/local-session.test.ts` 中
    - `local session smoke: create -> ws -> output -> resize -> kill`
- 验收标准：
  - 会话创建成功，返回有效 `sessionId/port/pid`
  - 终端可输入并收到输出
  - `resizeSession` 不报错
  - `killSession` 后收到退出事件或 WS 关闭

### A2. 连续输入命令可持续工作（修复“只第一条命令生效”回归）

- 覆盖来源（electerm）：
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/terminal.jsx`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/attach-addon-custom.js`
- 自动化方式：
  - `pnpm test:integration`
- 对应测试：
  - `/Users/a1/Documents/ai/war-room/localterm/tests/integration/local-session.test.ts` 中同一 smoke case
  - 已校验两次 `echo marker` 连续输入都成功
- 验收标准：
  - 第一条和第二条命令都能收到 marker 输出

### A3. 快速创建多个会话后，延迟连接仍可响应（修复“看起来 hang”回归）

- 覆盖来源（electerm）：
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-server.js`（会话数据面）
- 自动化方式：
  - `pnpm test:integration`
- 对应测试：
  - `/Users/a1/Documents/ai/war-room/localterm/tests/integration/local-session.test.ts` 中
    - `local sessions remain responsive when websocket attaches later`
- 验收标准：
  - 先创建 3 个 session，延迟连接 WS 后均可执行命令并返回 marker

### A4. 一会话一子进程隔离（PID/port 唯一）

- 覆盖来源（electerm）：
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-process.js`
- 自动化方式：
  - `pnpm test:integration`
- 对应测试：
  - `/Users/a1/Documents/ai/war-room/localterm/tests/integration/local-session.test.ts` 中
    - `one session maps to one worker process (unique pid/port)`
- 验收标准：
  - 同批创建多个 session 的 `pid` 不重复
  - `port` 不重复

### A5. registry snapshot 随生命周期更新（debug/ops 基础）

- 覆盖来源（electerm）：
  - 会话状态管理思路（改写复用）
- 自动化方式：
  - `pnpm test:integration`
- 对应测试：
  - `/Users/a1/Documents/ai/war-room/localterm/tests/integration/local-session.test.ts` 中
    - `registry snapshot updates when session lifecycle changes`
- 验收标准：
  - create 后 snapshot 中 session 状态为 `ready`
  - kill 后状态变为 `exited`

### A6. xterm addon 构建与加载链路完整

- 覆盖来源（electerm）：
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/xterm-loader.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/terminal.jsx`
- 自动化方式：
  - `pnpm --filter @localterm/renderer build`
- 验收标准：
  - renderer 构建成功
  - 产物包含 xterm addon chunk（fit/web-links/search/unicode11/canvas/webgl/ligatures）

### A7. 自动化总入口

- 命令：
  - `pnpm acceptance:auto`
- 覆盖内容：
  - `typecheck + integration tests + renderer build + debug:sessions`

## B. 手工验收（当前不适合纯自动化）

### B1. Electron UI 基础骨架（shadcn）

- 验收步骤：
  1. 运行 `pnpm dev`
  2. 检查顶部工具区按钮：`New Local Terminal`、`Debug Sessions`
  3. 检查 tab 区为 shadcn Tabs 风格，关闭按钮可用
  4. 打开 `Debug Sessions`，点击 `Refresh`，能看到 JSON 数据
- 期望结果：
  - UI 组件样式与交互正常，无白屏

### B2. 终端交互体验（输入焦点、连续输入、回显）

- 验收步骤：
  1. 新建 session
  2. 直接输入 `ls` 回车，再输入 `pwd` 回车，再输入 `echo ok` 回车
  3. 用鼠标点击终端区域，再输入命令
- 期望结果：
  - 每次输入都有效，输出持续追加，不会只生效一次

### B3. 默认 shell 启动行为（用户环境）

- 验收步骤：
  1. 新建 session，观察首屏 prompt
  2. 对比本机系统终端 prompt（例如 conda `(base)` 前缀）
- 期望结果：
  - localterm 默认 prompt 与系统终端行为一致（加载用户 shell 配置）

### B4. 多 tab 场景稳定性

- 验收步骤：
  1. 快速连续点击 `New Local Terminal` 创建 3~5 个 tab
  2. 在 tab 间切换并执行命令
  3. 关闭其中 1~2 个 tab，继续在剩余 tab 执行命令
- 期望结果：
  - 不出现“卡住不动/无输出”假死
  - 每个 tab 对应会话相互隔离

### B5. Web Links 行为

- 验收步骤：
  1. 在终端输入：`echo https://example.com`
  2. 点击链接
- 期望结果：
  - 链接可点击并在外部打开

### B6. 渲染后端降级（WebGL -> Canvas -> DOM）

- 验收步骤：
  1. 正常运行 `pnpm dev`，观察终端可用
  2. 如果本机图形环境受限，也应能继续显示终端（降级成功）
- 期望结果：
  - 无论 WebGL 是否可用，终端都能正常显示/输入

## C. 明确不在第一阶段验收范围

这些在 `electerm` 中存在，但当前 `localterm` 第一阶段不做验收：

1. SSH/SFTP/RDP/VNC/Spice
2. zmodem/trzsz 文件传输
3. Shell integration（OSC 633）与命令追踪
4. 终端搜索 UI（`addon-search` UI 层）
5. 关键词高亮与高级终端增强
