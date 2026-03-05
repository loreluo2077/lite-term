## Workspace 功能说明

## 1. 核心概念

Workspace 是可持久化的协作快照，包含：

- `layout`: Panel/Pane 树与激活信息
- `tabs`: Tab 容器描述

当前 Tab 描述采用“兼容迁移”结构：

- 主语义: `widget.kind + widget.input`
- 兼容字段: `tabKind + input`（仅用于读取旧快照）
- 当前写路径: 统一写 `schemaVersion=3`

## 2. 本地存储模型

存储目录（Electron `userData`）：

- `workspace-store/index.json`: workspace 索引（id/name/lastAccessed/isClosed）
- `workspace-store/workspaces/<workspaceId>.json`: workspace snapshot

## 3. 已实现 workspace 操作

### 3.1 创建

- 新建空 workspace
- 立即切换并保存
- 保持其他 workspace 运行态（热切换）

### 3.2 切换（Hot Switch）

- 切换前自动保存当前 workspace（可持久化时）
- 默认不 kill 现有 terminal session
- 不在当前布局中的 tab 以 orphan 形式隐藏保活

### 3.3 重命名 / Save As

- 支持重命名当前或历史 workspace
- 支持 Save As 生成新 workspace 快照

### 3.4 关闭与历史重开

- `close` 为软关闭（不删快照）
- 可从历史列表重开
- 关闭最后一个活跃 workspace 时进入临时空 workspace

### 3.5 删除

- 存在 `workspace:delete` IPC 与底层实现
- 当前 UI 主流程以 `close` 为主

## 4. 启动与恢复策略

### 4.1 应用启动（Cold Boot）

- 启动时读取默认 workspace 快照
- 按 `restorePolicy` 恢复运行态：
- `recreate`: 重建 terminal session
- `manual`: 仅恢复 tab/widget 描述

### 4.2 自动保存

- workspace/tabs 变更后 500ms 防抖自动保存
- 仅对未关闭 workspace 生效

## 5. 顺序与默认规则

- workspace 按首次创建顺序追加
- 更新已有 workspace 不改变顺序，仅更新访问时间
- 默认 workspace 为第一个可加载且未关闭项

## 6. 安全与一致性

- workspaceId 做路径安全校验（禁止 `..` 与路径分隔符）
- 索引与快照采用原子写（tmp + rename）
- schema 校验防止非法结构落盘

## 7. 自动化测试

- `tests/integration/workspace-schema.test.ts`
- 覆盖 snapshot 结构约束与 `tab.widget` 兼容
- `tests/integration/workspace-storage.test.ts`
- 覆盖 save/load/list/close/delete/default 流程
- `tests/integration/workspace-order.test.ts`
- 覆盖顺序稳定与追加规则
- 执行命令:
- `pnpm test`
- `pnpm verify:quick`

## 8. UI测试

- 新建 workspace，确认可创建 tab/widget
- 多 workspace 切换，确认激活态与列表状态正确
- Rename / Save As / Close / 历史重开行为一致
- 重启后快照恢复正确，restorePolicy 行为符合预期

## 9. 人类验收

- workspace 切换稳定，无错误覆盖
- 热切换不丢运行态，冷启动按策略恢复
- 自动保存生效，异常退出后可恢复最近可用状态
- 旧快照（无 widget 字段）可继续加载

## 10. 当前限制

- 图标与排序策略较基础（当前按索引顺序）
- 关闭/删除确认流可继续优化
- 暂无跨设备同步，仅本地持久化
