## Workspace 功能说明

> 文件名当前为 `worksapce.md`（拼写与代码无关，仅文档文件名历史原因）。

## 1. 核心概念

Workspace 是一份可持久化的工作快照，包含两部分：

- `layout`: pane 树结构、activePane、基础元信息
- `tabs`: tab 描述（tabKind、title、input、restorePolicy）

对应结构：

- `WorkspaceLayout` / `WorkspaceSnapshot`
- schemaVersion 当前为 `2`

## 2. 本地存储模型

桌面端存储目录（Electron `userData`）：

- `workspace-store/index.json`: workspace 元信息索引
- `workspace-store/workspaces/<workspaceId>.json`: 单个 workspace 快照

`index.json` 维护：

- `id`
- `name`
- `lastAccessed`
- `isClosed`（软关闭标记）

## 3. 已实现 workspace 操作

### 3.1 创建

- 支持新建空 workspace
- 新建后立即切换并持久化
- 保留当前 workspace 运行态（热切换）

### 3.2 切换（Hot Switch）

- 切换前自动保存当前活跃 workspace（若可持久化）
- 切换时默认不 kill 现有会话
- 当前 workspace 外的 tab 作为 orphan 保留在隐藏容器中，连接不断开

### 3.3 重命名 / Save As

- 支持重命名当前或历史 workspace
- 支持 Save As 生成新 workspace（新 id + 新 name）
- Save As 采用热切换方式，保留正在运行的会话

### 3.4 关闭与历史

- `close` 是软关闭: 快照仍在，侧边栏移出活动列表
- 可从 “Open Workspace” 弹窗重新打开历史 workspace
- 若关闭当前 workspace 且无其他打开项，进入临时空 workspace

### 3.5 删除

- 存在 `workspace:delete` IPC 与底层实现
- 当前 UI 主要使用 `close` 流程，delete 可用于后续管理能力扩展

## 4. 启动与恢复策略

### 4.1 应用启动（Cold Boot）

- renderer 启动后读取默认 workspace

按 tab `restorePolicy` 决定恢复方式：

- `recreate`: 重建会话（例如 terminal.local）
- `manual`: 仅恢复描述，不自动重建运行态

### 4.2 自动保存

- workspace/tabs 改动后防抖自动保存（500ms）
- 仅对“未关闭”的 workspace 自动保存

## 5. 顺序与默认 workspace 规则

- workspace 顺序按首次创建顺序追加
- 保存已有 workspace 不改变顺序，仅更新时间戳
- 默认 workspace 优先返回“第一个可加载且未关闭”的条目

## 6. 安全与一致性

- workspaceId 会做路径安全校验（禁止 `..` 和路径分隔符）
- 索引与快照写入采用原子写（临时文件 + rename）
- schema 校验由 `@localterm/shared` 提供，防止非法结构入库

## 7. 当前限制

- workspace 图标/排序策略较基础（当前按索引顺序显示）
- 关闭/删除的权限与确认流程可进一步细化
- 目前未提供“跨设备同步”，仅本地持久化
