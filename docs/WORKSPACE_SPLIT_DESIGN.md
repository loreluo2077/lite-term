# 混合式工作区分屏设计方案

## 📋 需求概述

**核心功能**：
1. 自由分屏（灵活布局，支持横竖分割）
2. 每个分屏区域支持多标签页
3. 工作区配置持久化（保存/加载/切换）
4. 标签页支持自定义重命名

**参考对象**：
- VS Code 的编辑器布局（分屏 + 标签页）
- Tmux/Terminator 的窗格分割
- electerm 的多标签管理

---

## 🎯 架构设计

### 1. 数据模型

#### 1.1 PaneNode（分屏节点树）

```typescript
/**
 * 递归树结构表示分屏布局
 * - leaf 节点：包含标签页的终端区域
 * - split 节点：包含子分屏的容器节点
 */
type PaneNode = {
  id: string;
  type: "leaf" | "split";

  // === leaf 节点专属字段 ===
  tabs?: TabRecord[];          // 该 Pane 的所有标签页
  activeTabId?: string;        // 当前激活的标签页 ID

  // === split 节点专属字段 ===
  direction?: "horizontal" | "vertical"; // 分割方向
  children?: PaneNode[];                // 子节点列表（通常2个）
  sizes?: number[];                     // 子节点尺寸比例 [0.3, 0.7]
};
```

#### 1.2 Workspace（工作区配置）

```typescript
/**
 * 完整的工作区配置，可保存/加载
 */
type Workspace = {
  id: string;              // 唯一标识
  name: string;            // 用户自定义名称（如 "后端开发环境"）
  root: PaneNode;          // 分屏树根节点
  createdAt: number;       // 创建时间戳
  updatedAt: number;       // 最后更新时间戳
};
```

#### 1.3 TabRecord 扩展

```typescript
/**
 * 扩展现有 TabRecord，新增 customTitle 支持重命名
 */
type TabRecord = {
  id: string;
  title: string;               // 默认标题（如 "Local Shell #1"）
  customTitle?: string;        // 用户自定义标题（优先显示）
  session?: SessionInfo;
  status: "creating" | "ready" | "exited" | "error";
  wsConnected: boolean;
  // ... 其他现有字段
};
```

---

### 2. 组件层次结构

```
App
├── WorkspaceToolbar          # 工作区操作栏
│   ├── WorkspaceSelector     # 下拉选择工作区
│   ├── SaveButton            # 保存当前工作区
│   └── NewButton             # 新建空白工作区
│
└── WorkspaceView             # 当前工作区根容器
    └── PaneContainer         # 递归分屏组件（核心）
        │
        ├── [type=leaf]
        │   ├── PaneToolbar   # 分屏操作按钮
        │   ├── TabBar        # 标签页列表
        │   └── TerminalPane  # 终端内容（复用现有组件）
        │
        └── [type=split]
            ├── Splitter      # 可拖拽的分割线
            ├── PaneContainer (子节点 1)
            └── PaneContainer (子节点 2)
```

---

### 3. 核心 API 设计

#### 3.1 分屏操作

```typescript
/**
 * 分屏管理 API（Jotai actions）
 */
export const paneActions = {
  /**
   * 将 leaf 节点分割为 split 节点
   * @param paneId 要分割的 Pane ID
   * @param direction 分割方向（横向/纵向）
   */
  splitPane(
    paneId: string,
    direction: "horizontal" | "vertical"
  ): void,

  /**
   * 关闭指定 Pane（将其标签页移动到兄弟节点，并移除该节点）
   * @param paneId 要关闭的 Pane ID
   */
  closePane(paneId: string): void,

  /**
   * 调整 split 节点下子节点的尺寸比例
   * @param parentId split 节点 ID
   * @param sizes 新的尺寸比例数组（和为 1）
   */
  resizePanes(parentId: string, sizes: number[]): void,

  /**
   * 移动标签页到另一个 Pane
   * @param tabId 标签页 ID
   * @param targetPaneId 目标 Pane ID
   */
  moveTab(tabId: string, targetPaneId: string): void
};
```

#### 3.2 标签页操作

```typescript
/**
 * 标签页扩展 API
 */
export const tabActions = {
  /**
   * 设置标签页自定义名称
   * @param tabId 标签页 ID
   * @param customTitle 新名称（空字符串则恢复默认）
   */
  setTabCustomTitle(tabId: string, customTitle: string): void,

  /**
   * 获取标签页显示名称（优先使用 customTitle）
   */
  getTabDisplayName(tab: TabRecord): string,

  /**
   * 在指定 Pane 创建新标签页
   * @param paneId 目标 Pane ID
   */
  createTabInPane(paneId: string): Promise<void>
};
```

#### 3.3 工作区持久化

```typescript
/**
 * Electron IPC API（renderer → main）
 */
export const workspaceApi = {
  /**
   * 保存工作区到本地
   * 路径: ~/.localterm/workspaces/{id}.json
   */
  saveWorkspace(workspace: Workspace): Promise<void>,

  /**
   * 加载指定工作区
   */
  loadWorkspace(id: string): Promise<Workspace>,

  /**
   * 列出所有已保存工作区
   */
  listWorkspaces(): Promise<Workspace[]>,

  /**
   * 删除工作区
   */
  deleteWorkspace(id: string): Promise<void>,

  /**
   * 获取默认工作区（应用启动时加载）
   */
  getDefaultWorkspace(): Promise<Workspace | null>
};
```

---

### 4. UI 交互设计

#### 4.1 分屏操作

**PaneToolbar 按钮布局**：
```
┌─────────────────────────────────────┐
│ [⊟ 横向分割] [⊞ 纵向分割] [✕ 关闭]  │
├─────────────────────────────────────┤
│ Tab1  Tab2  Tab3  [+]               │
└─────────────────────────────────────┘
```

**操作流程**：
1. 点击 `[⊟ 横向分割]`：
   - 当前 Pane 转为 split 节点
   - 创建 2 个 leaf 子节点（上下布局）
   - 原标签页分配到第一个子节点

2. 点击 `[✕ 关闭]`：
   - 如果是唯一 Pane，则不允许关闭
   - 否则将标签页移动到兄弟节点，移除当前节点

3. 拖拽分割线：
   - 使用 `react-resizable-panels` 的 `PanelResizeHandle`
   - 实时更新 `sizes` 数组

#### 4.2 标签页重命名

**方式：右键菜单（shadcn/ui ContextMenu）**

```
Tab1  [Tab2 ← 右键点击]  Tab3

┌────────────────────────────┐
│ 📝 重命名                  │
│ 📂 移动到新分屏            │
│ ─────────────────────      │
│ ✕ 关闭                     │
└────────────────────────────┘
```

**重命名流程**：
1. 右键点击 Tab → 显示 ContextMenu
2. 点击 "重命名" → Tab 进入编辑模式
3. 显示内联 Input 输入框（`<input autofocus />`）
4. 按 Enter 保存，按 Esc 取消

**UI 状态**：
```tsx
// 编辑模式
{renamingTabId === tab.id ? (
  <input
    value={editingTitle}
    onChange={(e) => setEditingTitle(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") saveRename();
      if (e.key === "Escape") cancelRename();
    }}
    onBlur={saveRename}
    autoFocus
  />
) : (
  <span>{tab.customTitle || tab.title}</span>
)}
```

#### 4.3 标签页拖拽

**目标场景**：
- 拖拽到其他 Pane 的 TabBar → 移动标签页
- 拖拽到 Pane 边缘 → 创建新分屏并移动
- 拖拽到空白区域 → 创建新根 Pane（如果当前只有1个 Pane）

**实现库**：
- `@dnd-kit/core` - 轻量级拖拽
- `@dnd-kit/sortable` - 标签页排序

---

### 5. 状态管理（Jotai）

```typescript
// atoms/workspace.ts

/**
 * 当前激活的工作区配置
 */
export const currentWorkspaceAtom = atom<Workspace>({
  id: "default",
  name: "默认工作区",
  root: {
    id: "pane-1",
    type: "leaf",
    tabs: [],
    activeTabId: undefined
  },
  createdAt: Date.now(),
  updatedAt: Date.now()
});

/**
 * 已保存的工作区列表（从 IPC 加载）
 */
export const savedWorkspacesAtom = atom<Workspace[]>([]);

/**
 * 自动保存 debounce 控制
 */
export const autoSaveAtom = atom(
  null,
  async (get, set) => {
    const workspace = get(currentWorkspaceAtom);
    await window.localtermApi.workspace.saveWorkspace(workspace);
  }
);
```

---

### 6. 持久化存储

#### 6.1 文件结构

```
~/.localterm/
├── workspaces.json          # 工作区元数据列表
└── workspaces/
    ├── default.json         # 默认工作区
    ├── {uuid-1}.json
    └── {uuid-2}.json
```

#### 6.2 workspaces.json 格式

```json
{
  "default": "default",
  "workspaces": [
    {
      "id": "default",
      "name": "默认工作区",
      "lastAccessed": 1709107200000
    },
    {
      "id": "backend-dev",
      "name": "后端开发环境",
      "lastAccessed": 1709193600000
    }
  ]
}
```

#### 6.3 单个工作区文件格式

```json
{
  "id": "backend-dev",
  "name": "后端开发环境",
  "root": {
    "id": "split-1",
    "type": "split",
    "direction": "horizontal",
    "sizes": [0.7, 0.3],
    "children": [
      {
        "id": "pane-1",
        "type": "leaf",
        "tabs": [
          {
            "id": "tab-1",
            "title": "Local Shell #1",
            "customTitle": "API Server",
            "session": null
          }
        ],
        "activeTabId": "tab-1"
      },
      {
        "id": "pane-2",
        "type": "leaf",
        "tabs": [],
        "activeTabId": null
      }
    ]
  },
  "createdAt": 1709107200000,
  "updatedAt": 1709193600000
}
```

**注意**：
- 不保存 `session` 对象（子进程状态无法序列化）
- 加载时自动为有 session 的 Tab 重新创建会话
- 或者第一阶段简化为：只保存 Pane 树结构，不保存 Tab 状态

---

### 7. 实现优先级

#### Phase 1：基础分屏（2-3天）

**目标**：实现静态分屏布局，无拖拽

- [ ] 定义 `PaneNode` / `Workspace` 类型（`packages/shared`）
- [ ] 实现 `currentWorkspaceAtom` + Jotai actions
- [ ] 实现 `PaneContainer` 递归组件
- [ ] 实现 `PaneToolbar` 分屏按钮
- [ ] 实现 `splitPane` / `closePane` 逻辑
- [ ] 集成 `react-resizable-panels` 支持拖拽调整大小

**验收标准**：
- ✅ 可以横向/纵向分割 Pane
- ✅ 可以关闭 Pane（标签页自动合并）
- ✅ 拖拽分割线实时调整尺寸

#### Phase 2：标签页增强（1-2天）

**目标**：支持重命名和跨 Pane 移动

- [ ] `TabRecord` 新增 `customTitle` 字段
- [ ] TabBar 组件支持双击重命名
- [ ] 实现 `moveTab` 逻辑
- [ ] 集成 `@dnd-kit/core` 支持拖拽
- [ ] 每个 Pane 独立管理 `activeTabId`

**验收标准**：
- ✅ 双击 Tab 可重命名
- ✅ 拖拽 Tab 到其他 Pane
- ✅ 切换 Pane 时正确聚焦 activeTab

#### Phase 3：工作区持久化（1-2天）

**目标**：保存/加载工作区配置

- [ ] Electron Main 端实现 `workspaceApi` IPC 处理器
- [ ] 实现 JSON 文件读写逻辑
- [ ] Renderer 端实现 `WorkspaceSelector` 组件
- [ ] 实现自动保存（debounce 300ms）
- [ ] 应用启动时加载默认工作区

**验收标准**：
- ✅ 可以保存当前工作区（名称 + 布局）
- ✅ 可以切换不同工作区
- ✅ 重启应用后恢复上次工作区

#### Phase 4：体验优化（1天）

**目标**：动画、快捷键、边缘 case 处理

- [ ] 分屏动画（淡入/展开）
- [ ] 拖拽预览指示器（高亮目标区域）
- [ ] 键盘快捷键：
  - `Ctrl+\` 横向分割
  - `Ctrl+Shift+\` 纵向分割
  - `Ctrl+W` 关闭当前 Pane
- [ ] 防止过小 Pane（最小宽度 200px）
- [ ] 空 Pane 引导 UI（"点击 + 创建终端"）

---

### 8. 技术选型

| 需求 | 方案 | 理由 |
|------|------|------|
| 分屏布局 | `react-resizable-panels` | 成熟的分割面板库，支持拖拽调整，VS Code 同款体验 |
| 状态管理 | Jotai atoms | 现有技术栈，易于递归树管理，性能好 |
| 拖拽 | `@dnd-kit/core` | 轻量级，支持复杂拖拽场景，无 jQuery 依赖 |
| 持久化 | Electron IPC + JSON | 简单可靠，第一阶段无需数据库，易于调试 |
| UI 组件 | shadcn/ui | 现有技术栈，保持一致性 |

---

### 9. 边缘 Case 处理

#### 9.1 关闭 Pane 时的标签页迁移

**场景**：关闭左侧 Pane，有 3 个标签页

**策略**：
- 将所有标签页移动到兄弟节点（右侧 Pane）
- 如果兄弟节点也是 split，移动到第一个 leaf 后代
- 保持原有 activeTabId（如果可能）

#### 9.2 最后一个 Pane

**场景**：用户尝试关闭唯一的 Pane

**策略**：
- 禁用 `[✕ 关闭]` 按钮
- 或者提示 "至少保留一个分屏"

#### 9.3 空 Pane 处理

**场景**：所有标签页被关闭后，Pane 为空

**策略**：
- 显示占位 UI："此分屏无活动终端"
- 提供快捷操作："[+ 新建终端]" 或 "[✕ 关闭此分屏]"

#### 9.4 工作区加载失败

**场景**：配置文件损坏或版本不兼容

**策略**：
- 降级到默认工作区（单 Pane）
- 显示错误通知："工作区加载失败，已恢复默认布局"

---

### 10. electerm 参考

**可参考的文件**（第二阶段再复用）：
- `src/client/components/tabs/` - 多标签页管理
- `src/client/store/session.js` - 会话状态管理
- **不参考** electerm 的分屏实现（其分屏逻辑与 SFTP 强耦合）

**建议**：
- 自己实现更现代化的分屏方案（基于 react-resizable-panels）
- electerm 的标签页拖拽逻辑可以参考

---

### 11. 设计决策（已确认）

#### Q1: 分屏层级限制 ✅

**决策**：设置最小 Pane 尺寸（200px），自然限制深度

**实现**：
- 在 `resizePanes` 时检查最小尺寸
- 如果分割后子 Pane 小于 200px，禁用分屏按钮
- 这样可以自适应窗口大小，灵活性更好

#### Q2: 新建终端的默认行为 ✅

**决策**：在当前激活 Pane 新增 Tab

**实现**：
- 维护全局 `activePaneId` 状态
- 点击 "New Local Terminal" 时，调用 `createTabInPane(activePaneId)`
- 点击任意 Pane 区域时，更新 `activePaneId`

#### Q3: 工作区数量限制 ✅

**决策**：不限制数量

**实现**：
- 用户可以保存任意多个工作区
- WorkspaceSelector 使用虚拟滚动（如果列表很长）
- 提供搜索框过滤工作区名称

#### Q4: Tab 重命名触发方式 ✅

**决策**：右键菜单 → 重命名（使用 Dropdown）

**实现**：
```tsx
// TabBar 组件中
<ContextMenu>
  <ContextMenuTrigger>
    <TabItem tab={tab} />
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={() => setRenamingTabId(tab.id)}>
      <Pencil className="mr-2 h-4 w-4" />
      重命名
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => moveTabToNewPane(tab.id)}>
      <Split className="mr-2 h-4 w-4" />
      移动到新分屏
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={() => closeTab(tab.id)}>
      <X className="mr-2 h-4 w-4" />
      关闭
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

**优点**：
- 更明确的操作意图（避免误触双击）
- 可以扩展更多右键菜单功能
- shadcn/ui 的 ContextMenu 组件现成可用

---

## 📂 文件变更清单

### 新增文件

```
packages/shared/src/types/workspace.ts        # Workspace/PaneNode 类型定义
apps/renderer/src/lib/atoms/workspace.ts      # Jotai workspace atoms
apps/renderer/src/components/PaneContainer.tsx
apps/renderer/src/components/PaneToolbar.tsx
apps/renderer/src/components/WorkspaceSelector.tsx
apps/desktop/src/ipc/workspace-handlers.ts    # IPC 处理器
apps/desktop/src/lib/workspace-storage.ts     # 文件读写逻辑
```

### 修改文件

```
apps/renderer/src/app/App.tsx                 # 集成 WorkspaceView
apps/renderer/src/components/TabBar.tsx       # 支持重命名 + 拖拽
apps/desktop/src/ipc/setup-ipc-handlers.ts    # 注册 workspace IPC
packages/shared/src/types/tab.ts              # TabRecord 新增 customTitle
```

---

## 🚀 开发路线图

### Week 1: Phase 1 基础分屏
- Day 1-2: 数据模型 + Jotai atoms + PaneContainer 组件
- Day 3: 分屏操作 UI + splitPane/closePane 逻辑
- Day 4: 集成 react-resizable-panels + 调试

### Week 2: Phase 2-3 标签页 + 持久化
- Day 1: TabRecord 扩展 + 重命名 UI
- Day 2: 拖拽集成（@dnd-kit）
- Day 3: IPC API + 文件存储
- Day 4: WorkspaceSelector + 自动保存

### Week 3: Phase 4 优化 + 测试
- Day 1-2: 动画、快捷键、边缘 case
- Day 3: 手动测试 + Bug 修复
- Day 4: 文档更新 + Code Review

---

## 📝 验收标准

### 功能完整性

- ✅ 可以横向/纵向分割 Pane（任意嵌套）
- ✅ 拖拽分割线实时调整尺寸
- ✅ 关闭 Pane 时标签页正确迁移
- ✅ 双击 Tab 重命名
- ✅ 拖拽 Tab 到其他 Pane
- ✅ 保存工作区到本地
- ✅ 切换不同工作区
- ✅ 重启应用恢复上次工作区

### 稳定性

- ✅ 无崩溃或卡顿
- ✅ 标签页迁移不丢失会话
- ✅ 配置文件损坏时降级处理

### 用户体验

- ✅ 分屏操作响应迅速（< 100ms）
- ✅ 拖拽有明确视觉反馈
- ✅ 空 Pane 有引导 UI
- ✅ 快捷键支持（Ctrl+\, Ctrl+W）

---

## 🎯 下一步行动

1. **创建需求文档**：
   ```bash
   /za:create-story workspace-split
   ```

2. **实现 Phase 1**：
   ```bash
   pnpm dev
   # 开始编写 PaneContainer 组件
   ```

3. **边做边调整**：
   - 如遇设计问题，及时更新本文档
   - 保持与 electerm 风格一致
