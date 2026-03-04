# 测试沉淀手册（Testing Playbook）

本手册用于沉淀“新功能必须配套自动化测试”的实践，适用于后续所有需求迭代。

## 1. 目标

- 新功能上线时，至少覆盖核心逻辑和主用户路径
- 避免“代码可运行但回归不可控”
- 让 Agent 和人类开发者都能用同一套门禁标准交付

## 2. 交付门禁（DoD）

每个新功能默认满足：

- 至少 1 条 `integration` 测试（逻辑/状态/存储）
- 至少 1 条 `e2e` 测试（真实 UI 操作路径）
- 文档标注本功能的测试覆盖点
- 本地通过：

```bash
pnpm verify:quick
pnpm test:e2e
```

建议最终再跑：

```bash
pnpm verify:ci
```

## 3. 测试分层

- `tests/integration`: 业务逻辑、schema、workspace 存储、pane-tree 操作
- `tests/e2e`: Electron 真实操作流（workspace/panel/tab/widget/session）

分工原则：

- 规则正确性放 integration
- 用户可见行为放 e2e

## 4. E2E 编写约定

- 入口文件：`tests/e2e/electron-smoke.spec.mjs`
- 启动入口：`tests/e2e/electron-entry.mjs`
- 保持隔离：每个用例独立 HOME + `LOCALTERM_E2E_USER_DATA_DIR`
- 断言优先可见行为：按钮、标题、状态文本
- 选择器优先级：`getByRole` > `getByTitle` > `getByText`
- 避免过度依赖内部实现细节与脆弱 CSS 结构

## 5. 新功能落地模板

1. 写功能清单（用户会做什么）
2. 列测试点（integration + e2e 各至少 1 条）
3. 先补失败测试或同时补测试
4. 实现功能
5. 跑 `verify:quick` 和 `test:e2e`
6. 更新文档中的“自动化测试 / UI 测试 / 人类验收”

## 6. 回归执行建议

- 本地快速回归：`pnpm verify:quick`
- UI 变更回归：`pnpm test:e2e`
- 提交前完整回归：`pnpm verify:ci`
- 覆盖盘点：`docs/testing_coverage_matrix.md`

## 7. 成功流程留证据（完整快照）

当前统一策略：只保留“完整快照 trace”结果（`trace.zip`，由测试手动采集）。

执行与查看：

```bash
pnpm test:e2e:review
pnpm test:e2e:report
```

产物位置：

- 人类验收入口：`output/playwright/human-report/index.md`
- 每条用例摘要：`output/playwright/human-report/<case>/README.md`
- 每步截图：`output/playwright/human-report/<case>/01.png` ...
- 完整快照 trace：`output/playwright/human-report/<case>/trace.zip`
- Playwright 原始目录：`output/playwright/test-results`

说明：

- 不再依赖 Playwright 自动 `trace.zip`、自动截图、视频文件
- Electron E2E 以 `trace.zip`（手动采集）作为唯一主证据，避免快照不全导致误判
