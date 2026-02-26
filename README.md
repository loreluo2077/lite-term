# localterm

一个面向开源演进的桌面终端项目骨架（第一阶段：本地终端，且每个会话一个子进程）。

## 第一阶段目标

- 多标签本地终端
- 每标签一个会话子进程
- 控制面 / 数据面分离
- 自动化快速验证链路
- 先把架构、测试约束和复用边界文档化

## 第一阶段非目标

- SSH / SFTP
- 终端搜索、复制粘贴、字体/主题增强
- shell integration / 命令建议
- zmodem / trzsz
- 复杂设置面板

## 目录概览

- `apps/desktop`: Electron 主进程 + preload（桌面壳）
- `apps/renderer`: Vite + React + shadcn/ui + jotai（UI）
- `packages/control-plane`: 会话控制面（进程与端口调度）
- `packages/session-worker`: 每会话子进程通用入口
- `packages/session-core`: 会话抽象接口与基类
- `packages/session-local`: node-pty 本地终端适配器
- `packages/shared`: 共享类型、schema、常量
- `packages/testkit`: 测试辅助工具
- `docs`: 架构、协议、测试约束、复用映射、ADR

详细设计见 `docs/`.

## 当前可验证状态（第一阶段进行中）

- `packages/shared` 已使用 `zod` 固定控制面/worker 协议
- `control-plane + session-worker + session-local` 本地终端主链路已打通
- `pnpm verify:quick` 当前可执行（类型检查 + 本地终端 smoke integration）

> 说明：`node-pty` 为原生模块。若本地未编译成功，请参考 `docs/DEV_COMMANDS.md` 中的构建说明。
