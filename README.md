# Create with You: Lo-Fi Room 产品说明书

## 1. 产品概述

**产品名称**: Create with You: Lo-Fi Room

Lo-Fi Room 聚焦“多 agent 协作 + 多终端并行 + 工作区管理”。

目标不是替代传统 IDE，而是提供一个更轻、更流式的协作操作台,因为现代编码的方式已经产生了变化,

不需要代码补全了,不需要人手编写代码了,现在更重要的是和agent的协同工作,你需要定义自己的协作流程,统帅多个Agent同时为你处理事情

Lo-fi 代表我期望的那个创作氛围,投入,放松

## 这是什么

Lo-Fi Room 是一个 Electron + React 的本地应用，核心目标是把多终端、多工作区、多面板协作放在一个统一界面里，降低在不同 CLI/窗口间切换的成本。

当前模型：

- Workspace 放 Panel
- Panel 放 Tab
- Tab 放 Widget
- Session 仅属于 local terminal widget

如果你是 AI Agent，请先阅读 `AGENT.md`，那里定义了任务执行流程和文档/代码更新规则。

## 代码结构（命名收敛）

- `apps/renderer/src/lib/widgets/state.ts`: widget 运行态（tab 容器 + widget 内容 + terminal session 归属）
- `apps/renderer/src/lib/widgets/drivers/*`: widget driver（local terminal / extension widget / noop）
- `apps/renderer/src/components/widgets/*`: widget 视图组件

说明：
- 运行时只有 widget：内置能力是 builtin widget，外部扩展通过 extension 包贡献 widget。

## Webview Widget 运行时（新）

- `extension widget` 统一通过 `webview` 运行，不再在 React 内直接渲染业务视图。
- 主进程注册 `localterm-extension://` 协议，用于加载 `extensions/<extensionId>/widgets/<widgetId>/index.html` 资产。
- `widget-webview.cjs` 在 webview 中注入 `window.widgetApi`，提供：
- `widget.*`（上下文、改标题、打开新 widget）
- `state.*`（get/set/patch + onDidChange）
- `workspace.*`（当前工作区、tab 列表、激活 tab）
- `fs.*`（选目录/文件、读目录、读文件）
- `terminal.*`（create/write/resize/kill/list）
- 内置 `terminal.local`、`file.browser`、`note.markdown` 已迁移为 webview widget（来源：`extensions/builtin.workspace`）。

## Packages 分层（base / widget / extension）

- Base 能力：
- `packages/widget-terminal/src/base`
- `packages/control-plane/src/port`、`packages/control-plane/src/registry`
- `packages/shared/src/schemas/base`
- Widget 能力：
- `packages/shared/src/schemas/widget`
- `packages/control-plane/src/widgets/local-terminal`
- `packages/widget-terminal/src/local-terminal`
- Extension 能力：
- `packages/shared/src/schemas/plugin`

协议约束：
- workspace snapshot: 仅 `schemaVersion=3`（纯 `widget`）
- extension manifest: 仅 `manifestVersion=2`（`widgetKinds`）
- extension widget input: 仅 `extensionId/widgetId/state`

说明：
- 会话核心实现统一收敛在 `packages/widget-terminal`

## 工程实践：新功能默认带测试

从本次迭代开始，新增功能不再只交付代码，默认需要同时交付自动化测试：

- 单元/集成测试：验证 schema、状态流、存储、核心逻辑
- 端到端测试（E2E）：验证用户真实操作路径（Electron UI + IPC + 会话链路）
- 文档同步：把测试覆盖点回写到对应功能文档

建议执行顺序：

```bash
pnpm verify:quick
pnpm test:e2e
pnpm verify:ci
```

当前质量门禁：

- `verify:quick` = `typecheck + integration`
- `verify:ci` = `verify:quick + e2e`

详细流程见：`docs/testing_playbook.md`
