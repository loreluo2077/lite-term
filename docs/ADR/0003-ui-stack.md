# ADR-0003：前端 UI 采用 shadcn/ui，终端区域保持 xterm 主导

## 状态

Accepted

## 背景

项目需要一个可维护、可主题化的桌面 UI 方案，同时终端区域本身由 xterm.js 控制渲染，不适合被通用组件库接管。

## 决策

前端 UI 使用 `shadcn/ui`（配合 React + Tailwind），但终端显示区域继续由 `xterm.js` 主导。

## 理由

1. `shadcn/ui` 适合表单、弹窗、tabs、菜单等桌面交互组件
2. 终端区域需要 xterm 的渲染与输入模型，不能套通用组件抽象
3. 可以让 UI 层与终端内核层边界更清楚

## 适用范围

适合 `shadcn/ui`：
- Tabs
- Dialog
- Dropdown Menu
- Sheet / Panel
- Buttons / Inputs / Form

不适合（第一阶段）：
- 终端渲染区
- 终端字符层交互逻辑

