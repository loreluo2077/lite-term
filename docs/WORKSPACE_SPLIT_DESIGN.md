# Workspace Split Design v2（面向可扩展工具区）

## 1. 目标与边界

### 1.1 目标
1. 同一个 Workspace 内支持多类型 Tab：本地终端、SSH、网页、浏览器视图、小组件、插件视图。
2. 支持自由分屏与多标签组合，形成“可编排的工具区”。
3. 支持未来 AI 生成功能以插件形式接入，而不是改动核心代码。
4. 为后续浮动窗口、快速指令圆盘保留稳定扩展点。

### 1.2 非目标（当前阶段不做）
1. 不做云端同步。
2. 不做插件市场与在线安装。
3. 不做跨设备会话迁移。

## 2. 核心设计原则

1. 布局状态与运行状态严格分离。
2. Tab 使用统一模型，但由 `tabKind` 分派到不同 Driver。
3. Electron 主进程只做壳与能力桥接，不写业务状态机。
4. 插件默认最小权限，按能力声明放行。
5. 协议先行：所有 IPC/WS/Plugin Host 通信先定义 schema。

## 3. 数据模型（可持久化 vs 运行态）

### 3.1 可持久化模型

```ts
type WorkspaceLayout = {
  schemaVersion: 2;
  id: string;
  name: string;
  root: PaneNode;
  activePaneId: string;
  createdAt: number;
  updatedAt: number;
  overlays?: OverlayLayout;
};

type PaneNode = LeafPaneNode | SplitPaneNode;

type LeafPaneNode = {
  id: string;
  type: "leaf";
  tabIds: string[];
  activeTabId?: string;
};

type SplitPaneNode = {
  id: string;
  type: "split";
  direction: "horizontal" | "vertical";
  children: [PaneNode, PaneNode];
  sizes: [number, number];
};

type TabDescriptor = {
  id: string;
  tabKind: TabKind;
  title: string;
  customTitle?: string;
  input: TabInput;
  restorePolicy: "recreate" | "manual";
};

type TabKind =
  | "terminal.local"
  | "terminal.ssh"
  | "web.page"
  | "web.browser"
  | "widget.react"
  | "plugin.view";

type TabInput =
  | {
      cols: number;
      rows: number;
      shell?: string;
      shellArgs?: string[];
      cwd?: string;
      env?: Record<string, string>;
    } // terminal.local
  | {
      pluginId: string;
      viewId: string;
      state: Record<string, unknown>;
    } // plugin.view
  | Record<string, unknown>; // other kinds (phase 1)

type OverlayLayout = {
  floatingPanels: FloatingPanelDescriptor[];
  commandRadial?: { enabled: boolean; hotkey: string };
};
```

### 3.2 运行态模型（不落盘）

```ts
type TabRuntimeState = {
  tabId: string;
  lifecycle: "starting" | "ready" | "exited" | "error";
  wsConnected?: boolean;
  pid?: number;
  port?: number;
  metrics?: {
    bytesIn: number;
    linesIn: number;
    lastRateBps: number;
  };
  errorMessage?: string;
};
```

## 4. Tab 类型分层（关键）

### 4.1 统一抽象

```ts
interface TabDriver<I = unknown> {
  kind: TabKind;
  create(input: I): Promise<DriverHandle>;
  restore(input: I): Promise<DriverHandle>;
  dispose(handle: DriverHandle): Promise<void>;
  serializeInput(input: I): Record<string, unknown>;
}
```

### 4.2 Driver 职责

1. `terminal.local`：复用当前 control-plane + session-worker + session-local。
2. `terminal.ssh`：后续新增 `session-ssh`，仍走同样的会话协议。
3. `web.page`：只读网页视图，可基于安全白名单加载 URL。
4. `web.browser`：带地址栏和导航能力的浏览器容器。
5. `widget.react`：内置工具组件（监控面板、日志分析器等）。
6. `plugin.view`：第三方扩展贡献的自定义界面。
7. 第一批内置插件示例：
   1. `builtin.workspace:file.browser`
   2. `builtin.workspace:widget.markdown`

## 5. 模块架构（按你现在仓库可落地）

### 5.1 apps/desktop（Electron 主进程 + preload）
负责窗口生命周期、IPC 注册、系统能力封装、权限网关。
不负责业务状态机与 Tab 内部协议。

### 5.2 apps/renderer（React + Jotai + shadcn）
负责 Workspace 组合、Pane 树渲染、Tab 激活、浮层系统、命令系统 UI。

### 5.3 packages/shared（zod schema + 协议常量）
统一定义：
1. workspace schema
2. session IPC schema
3. plugin host rpc schema
4. overlay/command schema

### 5.4 packages/control-plane（会话控制面）
统一会话生命周期接口：
1. createSession
2. resizeSession
3. killSession
4. listSessions

### 5.5 packages/session-*（按会话类型扩展）
1. `session-local`：已实现本地 shell。
2. `session-ssh`：后续增加，接口对齐 local，避免 UI 分叉。

### 5.6 packages/tab-drivers（新建）
每种 `tabKind` 一个 driver，实现 create/restore/dispose。
Renderer 不直接判断底层协议，统一调用 driver registry。

### 5.7 packages/plugin-host（后续）
加载插件清单、校验权限、启动隔离运行环境、桥接 API。

### 5.8 packages/plugin-sdk（后续）
给 AI 或开发者提供稳定 API：
1. 注册 tab 类型
2. 注册命令
3. 注册 widget
4. 读取受控 workspace 上下文

## 6. 插件体系（面向 AI 扩展）

### 6.1 插件清单

```json
{
  "id": "acme.log-tool",
  "version": "0.1.0",
  "contributes": {
    "tabKinds": ["plugin.view:logExplorer"],
    "commands": ["log.open", "log.filter"],
    "widgets": ["cpu-mini-card"]
  },
  "permissions": ["workspace.read", "session.list"],
  "entry": "dist/index.js"
}
```

### 6.2 能力隔离建议

1. 插件不能直接拿 `ipcRenderer`。
2. 所有能力通过 `pluginHost.invoke()`，并由权限网关校验。
3. 插件异常不应拖垮主 UI：单插件失败隔离。

## 7. 浮动窗口与指令圆盘（未来兼容）

### 7.1 浮动窗口
1. 第一阶段使用 Renderer Overlay（Portal + z-index）实现“浮动面板”。
2. 第二阶段如需真多窗体，再映射到 Electron `BrowserWindow`。

### 7.2 指令圆盘（Command Radial）
1. 建立统一 `CommandRegistry`。
2. 所有命令（新建终端、分屏、聚焦 Pane、打开插件）先注册为 command，再被按钮/快捷键/圆盘调用。
3. 圆盘只是命令入口 UI，不直接写业务逻辑。

## 8. 生命周期与会话策略（必须固定）

### 8.1 关闭策略
1. 关闭 Tab：默认 kill 对应 session。
2. 关闭 Pane：先迁移 Tab，再逐个执行 Tab 关闭策略。
3. 切换 Workspace：默认 kill 非 pinned 会话。
4. 退出应用：调用 control-plane 统一清理，防止 orphan。

### 8.2 恢复策略
1. `restorePolicy=recreate`：重启后按 descriptor 重建。
2. `restorePolicy=manual`：只恢复布局和 tab，占位待用户手动连接。
3. `plugin.view` 的 `input.state` 必须完整落盘，恢复时直接回填到插件视图。
4. `terminal.local` 不重放历史输出，只重建会话。

## 9. 协议与 schema 约束

1. 在 `packages/shared/src/schemas` 下新增：
   1. `workspace.ts`
   2. `tab-descriptor.ts`
   3. `plugin-rpc.ts`
2. 每次读写 workspace 均做 zod 校验。
3. `schemaVersion` 必填，升级时做 migration。

## 10. 测试与快速验证

### 10.1 自动化（必须）

1. 单测：
   1. Pane 树操作（split/close/moveTab）
   2. workspace schema 校验与 migration
   3. driver registry 分派
2. 集成测试：
   1. local terminal create/kill/reconnect
   2. workspace save/load
3. 压测脚本：
   1. 批量建会话
   2. 持续输出 5-10 分钟
   3. 采样 renderer heap + main rss + workers rss

### 10.2 手工验收（无法全自动）

1. 浮动面板拖拽与层级焦点。
2. 指令圆盘在高频切换场景的可用性。
3. 插件权限拒绝提示的 UX。

## 11. 分阶段落地路线（建议）

### Phase A（当前）
1. 引入 `WorkspaceLayout + TabDescriptor + TabRuntimeState` 三层模型。
2. 落地 `tab-drivers` 抽象，先支持 `terminal.local`。
3. 完成分屏 + 保存/加载 + 生命周期清理。

### Phase B
1. 新增 `terminal.ssh` driver。
2. 新增 `web.page` driver（受控 URL 白名单）。
3. 完成 CommandRegistry。

### Phase C
1. 新增 `plugin-host + plugin-sdk` 最小闭环。
2. 支持 `plugin.view` 与命令贡献。
3. 增加权限模型与沙箱策略。

### Phase D
1. 浮动窗口系统。
2. 指令圆盘。
3. 多窗口协同与高级编排。

## 12. 对你这个项目的直接建议

1. 现在就把“Tab 是什么”从终端实例升级成“可驱动内容容器”，否则后续接网页和插件会重构一次。
2. 先做 Driver 接口，不先做插件；先把内建类型跑通，再开放第三方。
3. 强制区分可持久化状态和运行态，这会直接减少未来 60% 的恢复/清理问题。
4. 命令中心提前做，后续圆盘、快捷键、工具栏都能复用同一套动作。

## 13. 本文档对应的下一步实现清单

1. 在 `packages/shared/src/schemas` 新增 workspace 相关 schema。
2. 在 Renderer 新增 `workspace atoms` 和 `pane tree reducers`。
3. 在 Renderer 新增 `tab driver registry`，先接 `terminal.local`。
4. 在 Desktop 增加 workspace 持久化 IPC（路径使用 `app.getPath("userData")`）。
5. 补齐 `kill:orphans` 与 `debug:sessions` 到 workspace 级视角。
