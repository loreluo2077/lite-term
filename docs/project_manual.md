# Build with You: Lo-Fi Room 产品说明书

## 1. 产品概述

**产品名称**: Build with You: Lo-Fi Room  
**产品定位**: 个人和 AI Agent 的协作终端平台

Lo-Fi Room 聚焦“多 agent 协作 + 多终端并行 + 工作区管理”。  
目标不是替代传统 IDE，而是提供一个更轻、更流式的协作操作台。

## 2. 当前版本已实现能力

## 2.1 Workspace（工作空间）

- 多 Workspace 管理（新建、切换、重命名、关闭、自动保存、历史重开）
- Workspace 快照持久化（布局 + tab 描述,widget状态）
- 热切换（切换 workspace 不会影响到布局和widget）

## 2.2 Panel（面板）

- Panel 必须隶属于 Workspace
- 支持水平/垂直分割
- 支持拖动分隔条调整比例
- 支持关闭 pane
- pane 内 tab 支持切换、重命名、关闭
- tab 支持拖拽到其他 pane（中心移动 + 四向分割投放）
- tab 支持拖拽到在同一个pane的其他位置

## 2.3 Widget

当前内置：

- 本地终端 `terminal.local`
- 文件浏览 `plugin.view:file.browser`
- Markdown 笔记 `plugin.view:widget.markdown`

## 2.4 会话系统（Session）

- 每个本地终端对应独立 worker 进程和独立 WS 端口
- 支持创建、resize、kill、列表查询
- 支持会话启动脚本（Startup Scripts，含延时）
- worker 支持断连后重连，不因 UI 切换立即退出

## 2.5 文件能力

- 打开系统中的某个文件并支持查看
