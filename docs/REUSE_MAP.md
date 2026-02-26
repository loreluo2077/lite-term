# 复用映射（基于 electerm 的参考/改写计划）

目标：明确哪些内容借鉴 electerm，哪些只参考，哪些暂不触碰，避免后续“边写边猜”。

## 复用分类

- `改写复用`：借鉴设计/流程，重写为本项目的 TypeScript 版本（推荐）
- `直接复制后迁移`：仅限小片段工具代码，需记录来源与许可证说明
- `只参考`：读思路，不直接迁移到第一阶段

## 第一阶段（本地终端）高优先级来源

### 1. 会话控制与子进程模型（改写复用）

- 来源：`/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-process.js`
- 用途：`packages/control-plane`
- 复用点：
  - 每会话子进程创建
  - 端口分配思路
  - 控制请求转发到会话子进程
- 注意：
  - 第一阶段改为 TS + schema 驱动
  - 避免把 electerm 的协议类型分支一并带入

### 2. 会话服务进程入口（改写复用）

- 来源：`/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-server.js`
- 用途：`packages/session-worker`
- 复用点：
  - 会话专属 WS 服务
  - 终端 `data`/`message`/`close` 生命周期
  - 进程退出清理模式
- 注意：
  - 第一阶段只保留 local 终端主链路
  - 去掉 zmodem/trzsz/sftp 等路径

### 3. 会话工厂与抽象基类（改写复用）

- 来源：
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-base.js`
- 用途：
  - `packages/session-core`
  - `packages/session-worker`
- 复用点：
  - 按类型加载会话实现的工厂思路
  - 基础会话元数据和清理约束
- 注意：
  - 第一阶段不引入日志落盘和复杂兼容逻辑

### 4. 本地终端实现（改写复用）

- 来源：`/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-local.js`
- 用途：`packages/session-local`
- 复用点：
  - `node-pty` 启动与 resize/write/kill 基本模式
- 注意：
  - 使用 TS 接口适配 `SessionAdapter`
  - 统一错误事件上报格式

### 5. 前端终端数据流初始化（只取主线，改写复用）

- 来源：
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/terminal.jsx`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/xterm-loader.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/attach-addon-custom.js`
- 用途：`apps/renderer`
- 复用点：
  - xterm 初始化顺序
  - 创建会话后再连接 session WS
  - Attach 层的边界设计
- 注意：
  - 第一阶段不带入搜索、shell integration、传输协议支持

## 第一阶段仅参考（第二阶段以后再用）

### SSH 与复杂认证（只参考）

- 来源：`/Users/a1/Documents/ai/war-room/electerm/src/app/server/session-ssh.js`
- 计划：第二阶段 `packages/session-ssh`

### shell integration 与命令追踪（只参考）

- 来源：
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/command-tracker-addon.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/client/components/terminal/shell.js`
- 计划：第二阶段后半段再评估

### zmodem/trzsz（只参考）

- 来源：
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/zmodem.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/server/trzsz.js`
- 计划：非第一阶段目标

## 主进程与 preload 结构参考（改写复用）

- 来源：
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/app.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/lib/create-app.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/lib/create-window.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/lib/ipc.js`
  - `/Users/a1/Documents/ai/war-room/electerm/src/app/preload/preload.js`
- 用途：`apps/desktop`
- 复用点：
  - 主进程职责边界
  - preload 安全桥接模式
- 注意：
  - 第一阶段只保留会话相关 IPC

## 维护规则（必须执行）

1. 任何新引入的 electerm 参考文件，必须补充到本文件。
2. 如果发生“直接复制后迁移”，必须同步创建 `docs/PROVENANCE.md` 记录来源与许可证说明。
3. PR 中涉及复用策略变更，必须更新 `REUSE_MAP.md`。

