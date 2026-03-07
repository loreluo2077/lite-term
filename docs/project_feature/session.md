## Session 功能说明

## 1. 定位

Session 不是通用 Tab 概念。  
Session 仅属于本地终端类 widget 的运行时资源（`extension terminal`）。

即：

- Workspace / Panel / Tab 负责布局与容器
- Widget 负责内容
- 仅本地终端类 widget 才会持有 Session（pid、port、status、ws 状态）

## 2. 当前支持范围

- 当前本地终端能力统一为 `extension terminal`
- 每个 terminal session 对应独立 worker 进程 + 独立 WebSocket 端口
- `extension terminal`: builtin extension 的 `terminal.local` webview widget

## 3. 架构分层

### 3.1 控制平面

- `packages/control-plane/src/widgets/local-terminal`
- 能力: `createLocalSession / resizeSession / killSession / listSessions`

### 3.2 会话执行层

- `packages/widget-terminal/src/local-terminal`: 管理 WS server、转发 IO、处理生命周期
- `packages/widget-terminal/src/local-terminal`: node-pty 本地 shell adapter
- `packages/widget-terminal/src/base`: adapter 抽象

### 3.3 渲染层

- `PluginWidgetPane` 处理 `widgetApi.terminal.*` 请求（create/write/resize/kill/list）
- `packages/widget-terminal-react` 构建到 `extensions/builtin.workspace/widgets/terminal.local`，作为 `extension terminal` webview 入口

## 4. 生命周期与状态

状态：

- `starting`
- `ready`
- `exited`
- `error`

事件：

- 控制事件: `ready | exit | error`
- 普通输出: 文本/二进制消息
- widget 状态字段: `sessionId / port / pid / status / wsConnected`

## 5. 已实现能力

### 5.1 创建/销毁/调整尺寸

- 新建 `extension terminal` 时创建 session（`widgetApi.terminal.create`）
- 前端可通过 `widgetApi.terminal.resize` 调整尺寸
- 关闭 `extension terminal` 或 kill 时释放会话（extension driver dispose + `terminal.kill`）

### 5.2 重连与保活

- worker 允许断连后重连
- workspace 热切换场景可保持会话运行态
- `extension terminal` 的 webview 侧支持按 `sessionId` 恢复已有 session（list + reconnect）

### 5.3 终端渲染与交互（xterm.js）

- `terminal.local` 使用 xterm.js 渲染完整 ANSI 输出，不再以纯文本降级显示
- 启用 fit + resize 同步：容器尺寸变化后自动调用 `widgetApi.terminal.resize`
- 支持选中文本后浮动复制按钮
- 支持右键菜单：`Paste` / `Clear`

### 5.4 Startup Scripts

- terminal 创建流程支持多条启动脚本（delayMs）
- startup scripts 在 `terminal.create` 时下发到会话
- 支持在 tab 右键菜单中编辑 startup scripts（更新到 widget state）

### 5.5 调试与性能

- Perf Panel: 输出吞吐、内存采样
- Debug Sessions: control-plane registry 快照

## 6. 数据约束（已生效）

当前运行期逻辑已以 widget 为主：

- 主要读取 `tab.widget.kind/input`
- 运行态主字段为 `widgetKind`
- `extension terminal` 的 session 元数据存于 `extension input.state`

- workspace snapshot 仅 `schemaVersion=3` + `widget` 描述

## 7. 自动化测试

- 已覆盖（集成测试）:
- `tests/integration/local-session.test.ts`
- 覆盖创建、输出、resize、kill、延迟连接、唯一 pid/port、snapshot 更新
- 已覆盖（E2E）:
- `workspace + extension terminal end-to-end smoke`
- `terminal startup scripts creation path works`
- 执行命令:
- `pnpm test`
- `pnpm verify:quick`
- `pnpm test:e2e`
- 诊断脚本:
- `pnpm debug:sessions`
- `pnpm kill:orphans`
- `pnpm perf:stress`

## 8. UI测试

- 新建 `extension terminal`，确认状态从 `starting` 到 `ready`
- 输入输出正常，关闭后退出
- 热切换 workspace 后返回，终端可继续交互
- 配置 startup scripts 后验证执行顺序与去重
- 验证 `extension terminal` webview 显示 `ws connected/disconnected` 与 session 状态一致

## 9. 人类验收

- Session 只在 `extension terminal` 上出现
- 非终端类 widget 不应触发会话相关逻辑
- 多会话并发无串线、无端口冲突
- 热切换与冷启动恢复行为符合预期
- 关闭 `extension terminal` 后，对应 session 应从 `session.list` 中消失
