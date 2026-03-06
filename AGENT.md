# AGENT.md

本文件给 AI Agent 使用，不是给普通用户看的 README。

## 1. 目标

在不破坏现有行为的前提下，基于代码事实完成需求：

- 先理解再修改
- 文档和代码保持一致

核心模型约束（不可混淆）：

- Workspace 放 Panel
- Panel 放 Tab
- Tab 放 Widget
- Session 仅属于 local terminal widget

## 2. 开工前必读顺序

1. `docs/project_manual.md`（产品说明书）
2. `docs/project_architecture.md`（架构和数据流）
3. 按任务类型阅读详细的功能文档（`docs/project_feature/workspace.md`、`docs/project_feature/panel.md`、`docs/project_feature/session.md`）
4. 再读取相关源码与测试

如果文档与代码冲突，以代码现状为准，并在交付时明确指出差异;

## 3. 仓库关键路径

- `apps/desktop`: Electron 主进程、IPC、workspace 存储
- `apps/desktop/src/extensions/extension-protocol.ts`: `localterm-extension://` 资产协议
- `apps/desktop/src/preload/widget-webview.cjs`: webview 侧 `window.widgetApi` bridge
- `apps/renderer`: UI、pane-tree、tab 容器、widget 渲染
- `apps/renderer/src/lib/widgets`: widget runtime state + widget drivers
- `apps/renderer/src/components/widgets`: widget 组件（local terminal / extension widget）
- `packages/control-plane/src/port` + `src/registry`: base 控制平面能力
- `packages/control-plane/src/widgets/local-terminal`: local terminal widget 控制平面
- `packages/widget-terminal/src/base`: session adapter 基础抽象
- `packages/widget-terminal/src/local-terminal`: local terminal widget adapter + worker 入口
- `packages/shared/src/schemas/base|widget|plugin|workspace`: 协议分层
- `tests/integration`: 关键集成测试

协议版本约束：
- workspace snapshot 仅支持 `schemaVersion=3(widget)`
- extension manifest 仅支持 `manifestVersion=2(widgetKinds)`
- extension widget input 仅支持 `extensionId/widgetId/state`

## 4. 任务执行流程

1. 盘点上下文：读相关文档、代码、测试
2. 明确影响面：列出要改的文件
3. 先写测试计划：本次改动对应哪些 integration / e2e 场景
4. 实施修改：只改与任务直接相关文件
5. 本地校验：至少执行相关检查或测试
6. 回写文档：若行为变化，更新对应文档
7. 输出结果：说明改了什么、为什么、如何验证

## 5. 修改原则

- 不随意重命名或移动文件，除非任务明确要求
- 不回滚用户已有改动
- 不引入与任务无关的大规模重构
- 优先复用现有抽象（schema、driver、adapter、atom）
- 任何“已实现”描述必须能在代码中找到对应实现

## 6. 文档更新规则

当代码行为变更时，至少检查以下文档是否需要同步：

- `README.md`（用户入口、命令、能力摘要）
- `docs/project_manual.md`（产品能力）
- `docs/project_architecture.md`（模块和数据流）
- `docs/project_feature` (产品功能的详细文档）

禁止把“计划中”写成“已实现”。

## 7. 测试与质量门禁（强制）

- 新功能默认需要补测试，不能只改实现不补验证
- 至少包含 1 条 integration（逻辑/状态/存储）
- 至少包含 1 条 e2e（真实用户路径）
- 提交前至少跑 `pnpm verify:quick`
- 涉及 UI 交互、workspace/panel/tab/widget/session 链路时，额外跑 `pnpm test:e2e`
- 最终交付建议跑 `pnpm verify:ci`

E2E 约定：

- 复用 `tests/e2e/electron-smoke.spec.mjs` 的 helper 模式
- 保持测试隔离（独立 HOME + userData）
- 优先断言用户可见行为，不断言实现细节
- 定位器优先 role/title/text，避免脆弱 selector

## 8. 常用命令

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm verify:quick
pnpm verify:ci
```

## 9. 交付格式建议

- 变更文件清单
- 关键实现点
- 验证结果（执行了哪些命令）
- 未完成项或风险（如有）

## 10. todo

当前阶段目标：

- [x] 内置 file/note 迁移到 webview widget runtime
- [x] 增加 `localterm-extension://` 协议与 `widgetApi` bridge
- [x] 补齐 webview widget 的 e2e 覆盖与人类验收快照
- [x] local terminal 迁移为 extension webview widget（启用 `widgetApi.terminal.*`）
- [ ] 下一阶段：terminal webview 接入 xterm.js 与高级交互（搜索、链接、unicode、ligature）
