## Session 功能说明

## 1. 定位

Session 不是通用 Tab 概念。  
Session 仅属于 `terminal.local widget` 的运行时资源。

即：

- Workspace / Panel / Tab 负责布局与容器
- Widget 负责内容
- Terminal Widget 才会持有 Session（pid、port、status、ws 状态）

## 2. 当前支持范围

- 当前仅实现 `terminal.local`
- 每个 terminal session 对应独立 worker 进程 + 独立 WebSocket 端口

## 3. 架构分层

### 3.1 控制平面

- `packages/control-plane/src/widgets/local-terminal`
- 能力: `createLocalSession / resizeSession / killSession / listSessions`

### 3.2 会话执行层

- `packages/widget-terminal/src/local-terminal`: 管理 WS server、转发 IO、处理生命周期
- `packages/widget-terminal/src/local-terminal`: node-pty 本地 shell adapter
- `packages/widget-terminal/src/base`: adapter 抽象

### 3.3 渲染层

- `LocalTerminalWidgetPane` 仅接收 local terminal tab（widget.kind=terminal.local）
- 通过 `connectSessionWebSocket` 连接 worker 数据平面

## 4. 生命周期与状态

状态：

- `starting`
- `ready`
- `exited`
- `error`

事件：

- 控制事件: `ready | exit | error`
- 普通输出: 文本/二进制消息

## 5. 已实现能力

### 5.1 创建/销毁/调整尺寸

- 新建 terminal widget 时创建 session
- pane 尺寸变化、激活切换时同步 resize
- 关闭 tab 或 kill 时释放会话

### 5.2 重连与保活

- worker 允许断连后重连
- workspace 热切换场景可保持会话运行态

### 5.3 Startup Scripts

- terminal widget 支持多条启动脚本（delayMs）
- 会话 ready 后执行
- 按 `tabId:sessionId` 去重，避免重复触发

### 5.4 调试与性能

- Perf Panel: 输出吞吐、内存采样
- Debug Sessions: control-plane registry 快照

## 6. 数据约束（已生效）

当前运行期逻辑已以 widget 为主：

- 主要读取 `tab.widget.kind/input`
- 运行态主字段为 `widgetKind`
- `session` 仅在 local terminal tab 类型上存在

- workspace snapshot 仅 `schemaVersion=3` + `widget` 描述

## 7. 自动化测试

- 已覆盖（集成测试）:
- `tests/integration/local-session.test.ts`
- 覆盖创建、输出、resize、kill、延迟连接、唯一 pid/port、snapshot 更新
- 执行命令:
- `pnpm test`
- `pnpm verify:quick`
- 诊断脚本:
- `pnpm debug:sessions`
- `pnpm kill:orphans`
- `pnpm perf:stress`

## 8. UI测试

- 新建 terminal widget，确认状态从 `starting` 到 `ready`
- 输入输出正常，关闭后退出
- 热切换 workspace 后返回，终端可继续交互
- 配置 startup scripts 后验证执行顺序与去重

## 9. 人类验收

- Session 只在 terminal widget 上出现
- 非 terminal widget 不应触发会话相关逻辑
- 多会话并发无串线、无端口冲突
- 热切换与冷启动恢复行为符合预期
