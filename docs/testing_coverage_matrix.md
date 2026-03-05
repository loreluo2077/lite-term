# 测试覆盖矩阵（Feature x Test）

本矩阵用于回答两个问题：

- 当前每个功能点由哪些自动化测试覆盖
- 哪些功能存在覆盖空白（需要补测）

覆盖级别说明：

- `integration`: 逻辑/状态/存储/协议层验证
- `e2e`: Electron UI + IPC + 会话链路真实路径
- `manual`: 当前仅有人工验收建议，尚无自动化用例

## 1. Workspace

| 功能点 | integration | e2e | 状态 |
|---|---|---|---|
| 创建 workspace | `tests/integration/workspace-storage.test.ts` | `workspace + local terminal widget end-to-end smoke` | 已覆盖 |
| 切换 workspace（热切换） | `tests/integration/workspace-storage.test.ts` | `workspace save-as hot switch keeps local session alive` | 已覆盖 |
| 关闭到历史并重开 | `tests/integration/workspace-storage.test.ts` | `workspace close to history then reopen from picker` | 已覆盖 |
| Save As 生成新快照 | `tests/integration/workspace-storage.test.ts` | `workspace save-as hot switch keeps local session alive` | 已覆盖 |
| workspace 顺序稳定/追加规则 | `tests/integration/workspace-order.test.ts` | - | 已覆盖（integration） |
| 空默认/损坏快照回退 | `tests/integration/workspace-storage.test.ts` | - | 已覆盖（integration） |
| workspaceId 路径安全 | `tests/integration/workspace-storage.test.ts` | - | 已覆盖（integration） |
| 冷启动 restorePolicy 差异（recreate/manual） | 部分：`tests/integration/workspace-schema.test.ts` | - | 部分覆盖 |

## 2. Panel / Tab

| 功能点 | integration | e2e | 状态 |
|---|---|---|---|
| Split H / Split V | `tests/integration/pane-tree.test.ts` | `panel split + widget creation + pane close flow` | 已覆盖 |
| 关闭 pane 与 tab 迁移 | `tests/integration/pane-tree.test.ts` | `panel split + widget creation + pane close flow` | 已覆盖 |
| 禁止关闭最后一个 pane | `tests/integration/pane-tree.test.ts` | - | 已覆盖（integration） |
| Tab 跨 pane 移动 | `tests/integration/pane-tree.test.ts` | `tab drag-drop center...` | 已覆盖 |
| 拖拽 center 投放 | - | `tab drag-drop center moves tab without creating extra split` | 已覆盖（e2e） |
| 拖拽 left/right/top/bottom 投放 | - | `tab drag-drop left/right/top/bottom creates a new split` | 已覆盖（e2e） |
| 激活 tab / pane 行为 | `tests/integration/pane-tree.test.ts` | 多条 e2e 间接覆盖 | 已覆盖 |
| 分隔条 resize 后持久化恢复 | - | - | 待补 |

## 3. Widget

| 功能点 | integration | e2e | 状态 |
|---|---|---|---|
| terminal.local widget 创建 | `tests/integration/workspace-schema.test.ts` | `workspace + local terminal widget...` | 已覆盖 |
| note.markdown（builtin widget） | `tests/integration/workspace-schema.test.ts` | `panel split + widget creation + pane close flow` | 已覆盖 |
| file.browser（builtin widget） | `tests/integration/workspace-schema.test.ts` | `panel split + widget creation + pane close flow` | 已覆盖 |
| external widget（兼容 kind: plugin.widget）协议与归一化 | `tests/integration/workspace-schema.test.ts` | - | 已覆盖（integration） |
| widget/tabKind 兼容与迁移 | `tests/integration/workspace-schema.test.ts` | - | 已覆盖（integration） |
| 旧快照加载（无 widget 字段） | 部分：schema 兼容 | - | 部分覆盖 |

## 4. Session（terminal.local 专属）

| 功能点 | integration | e2e | 状态 |
|---|---|---|---|
| create -> ws -> output -> resize -> kill | `tests/integration/local-session.test.ts` | `workspace + local terminal widget...` | 已覆盖 |
| 延迟连接后仍可用 | `tests/integration/local-session.test.ts` | - | 已覆盖（integration） |
| 一会话一 worker（pid/port 唯一） | `tests/integration/local-session.test.ts` | - | 已覆盖（integration） |
| registry lifecycle 更新 | `tests/integration/local-session.test.ts` | - | 已覆盖（integration） |
| startup scripts UI 路径 | `tests/integration/workspace-schema.test.ts`（结构） | `terminal startup scripts creation path works` | 已覆盖 |
| 关闭 tab 时 session 释放（UI层） | - | - | 待补 |

## 5. Schema / Protocol

| 功能点 | integration | e2e | 状态 |
|---|---|---|---|
| workspace schema v2 合法性 | `tests/integration/workspace-schema.test.ts` | - | 已覆盖 |
| split sizes 约束 | `tests/integration/workspace-schema.test.ts` | - | 已覆盖 |
| plugin rpc error 结构 | `tests/integration/workspace-schema.test.ts` | - | 已覆盖 |
| plugin input 默认 state | `tests/integration/workspace-schema.test.ts` | - | 已覆盖 |
| plugin manifest v1(tabKinds) -> v2(widgetKinds) 迁移 | `tests/integration/workspace-schema.test.ts` | - | 已覆盖 |

## 6. 人类验收入口

- 人类可读报告索引：`output/playwright/human-report/index.md`
- 每条用例摘要 + 分步截图：`output/playwright/human-report/<case>/README.md`
- 深入回放：`output/playwright/human-report/<case>/trace.zip`

## 7. 待补测试（优先级）

1. `P1` 分隔条 resize 后重启恢复（panel size persistence）
2. `P1` 关闭 terminal tab 后 session 真正释放（UI+control-plane 联动）
3. `P2` 冷启动时 restorePolicy=recreate/manual 的端到端差异路径
4. `P2` 旧快照（仅 tabKind/input）从真实存档加载回归
