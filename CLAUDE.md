# lite-term Claude 项目上下文

## 项目概述

lite-term (localterm) 是一个从 electerm 迁移核心功能的桌面终端项目。当前处于**第一阶段**：实现多标签本地终端，每个会话一个子进程的架构验证。

### 关键设计原则

1. **控制面与数据面分离**
   - 控制面：通过 IPC 处理会话创建/销毁/调整
   - 数据面：每个会话一条独立 WebSocket 传输终端字节流

2. **进程架构**（一会话一子进程）
   - Electron Main 进程（apps/desktop）
   - Renderer 进程（apps/renderer）
   - Control Plane（运行在 Main 内）
   - Session Worker（每会话一个子进程）

3. **代码复用策略**
   - 改写复用：借鉴 electerm 设计，重写为 TypeScript
   - 直接复制：仅限小工具片段，需记录来源
   - 只参考：读思路，不迁移到第一阶段

## 技术栈

- **构建工具**: pnpm monorepo
- **桌面壳**: Electron 31.x
- **前端**: Vite + React + shadcn/ui + jotai
- **终端**: @xterm/xterm + node-pty
- **类型**: TypeScript + Zod schema
- **测试**: Node.js test runner

## 目录结构

```
lite-term/
├── apps/
│   ├── desktop/          # Electron 主进程 + preload
│   └── renderer/         # React UI + xterm 集成
├── packages/
│   ├── shared/           # 共享类型、schema、常量
│   ├── control-plane/    # 会话控制面（进程与端口调度）
│   ├── session-worker/   # 每会话子进程入口
│   ├── session-core/     # 会话抽象接口与基类
│   ├── session-local/    # node-pty 本地终端适配器
│   └── testkit/          # 测试辅助工具
├── docs/                 # 架构、协议、测试约束、复用映射
├── tests/
│   └── integration/      # 集成测试
└── scripts/              # 调试与性能测试脚本
```

## 参考项目

electerm（位于 `../electerm`）：成熟的开源终端/SSH 客户端
- 当前正在从 electerm 迁移第一阶段核心功能
- 主要参考文件见 `docs/REUSE_MAP.md`

## 第一阶段目标

✅ **包含功能**:
- 多标签本地终端（node-pty）
- 每标签一个会话子进程
- 控制面/数据面分离架构
- xterm 基础 addons（fit/web-links/search/unicode11/canvas/webgl/ligatures）
- 自动化快速验证链路

❌ **明确排除**（第二阶段）:
- SSH/SFTP/RDP/VNC
- zmodem/trzsz 文件传输
- Shell integration（OSC 633）与命令追踪
- 复杂设置面板
- 终端搜索 UI
- 关键词高亮与高级终端增强

## 关键命令

```bash
# 开发模式（启动 renderer + desktop）
pnpm dev

# 快速验证（类型检查 + 集成测试）
pnpm verify:quick

# 完整验收链路（typecheck + tests + build + debug）
pnpm acceptance:auto

# 集成测试
pnpm test:integration

# 调试工具
pnpm debug:sessions      # 查看会话注册表状态
pnpm kill:orphans        # 清理遗留子进程
pnpm perf:stress         # 性能压力测试
```

## 当前测试任务目标

### 主要任务
🎯 **测试 lite-term 并找出迁移问题**

需要验证的核心链路（参考 `docs/ACCEPTANCE_CHECKLIST.md`）：

#### A. 自动化验收项
1. ✅ 控制面/会话链路（create -> ws -> input/output -> resize -> kill）
2. ✅ 连续输入命令可持续工作（防止"只第一条命令生效"回归）
3. ✅ 快速创建多会话后延迟连接仍可响应
4. ✅ 一会话一子进程隔离（PID/port 唯一）
5. ✅ registry snapshot 随生命周期更新
6. ✅ xterm addon 构建与加载链路完整

#### B. 手工验收项（需要手动测试）
1. **Electron UI 基础骨架**
   - 运行 `pnpm dev`
   - 检查顶部按钮：New Local Terminal、Debug Sessions
   - 检查 tab 区 shadcn 风格，关闭按钮可用
   - 打开 Debug Sessions，点击 Refresh 查看 JSON

2. **终端交互体验**
   - 新建 session，连续输入 `ls`、`pwd`、`echo ok`
   - 鼠标点击终端区域后再输入命令
   - 验证每次输入都有效，输出持续追加

3. **默认 shell 启动行为**
   - 新建 session，观察首屏 prompt
   - 对比系统终端 prompt（如 conda 环境前缀）

4. **多 tab 场景稳定性**
   - 快速创建 3-5 个 tab
   - 在 tab 间切换并执行命令
   - 关闭 1-2 个 tab，继续在剩余 tab 执行命令

5. **Web Links 行为**
   - 输入 `echo https://example.com`
   - 点击链接验证是否可外部打开

6. **渲染后端降级**
   - 验证 WebGL -> Canvas -> DOM 降级机制

### 常见问题排查

参考 electerm 与 lite-term 的差异：
- **会话管理**: `session-process.js` vs `control-plane/`
- **Worker 进程**: `session-server.js` vs `session-worker/`
- **终端适配**: `session-local.js` vs `session-local/`
- **前端集成**: `terminal.jsx` vs `apps/renderer`

### 问题报告要点

发现问题时记录：
1. 复现步骤
2. 预期行为 vs 实际行为
3. 控制台错误日志
4. `pnpm debug:sessions` 输出
5. 相关 electerm 参考文件（如有）

## 重要文档参考

- `docs/ARCHITECTURE.md` - 架构设计与职责边界
- `docs/REUSE_MAP.md` - electerm 复用映射
- `docs/ACCEPTANCE_CHECKLIST.md` - 验收清单
- `docs/TESTING_POLICY.md` - 测试约束与规范
- `docs/SESSION_PROTOCOL.md` - 控制面/数据面协议
- `docs/PROVENANCE.md` - 代码来源追踪
- `docs/XTERM_PARITY.md` - xterm 功能对齐

## 已知约束

1. **原生模块依赖**: node-pty 需要本地编译（pnpm 10 默认拦截构建脚本）
2. **测试环境**: 集成测试需要使用 `bash --noprofile --norc` 保证稳定性
3. **平台兼容**: 当前主要在 Windows (win32) 开发，需注意 shell 路径使用 Unix 语法
4. **端口分配**: Session Worker 使用动态端口，需确保端口不冲突

## 开发工作流

1. 修改代码
2. 运行 `pnpm verify:quick` 确保基础链路正常
3. 运行 `pnpm dev` 手动验收 UI 交互
4. 如遇问题，使用 `pnpm debug:sessions` 查看会话状态
5. 清理时使用 `pnpm kill:orphans` 避免遗留进程

## 迁移进度追踪

当前状态：✅ 第一阶段核心链路已打通
- 控制面 + worker + local 主链路完成
- xterm addon 加载完成
- 自动化测试通过（`pnpm verify:quick`）

待验证项目：📋 手工验收清单（B1-B6）

## 注意事项

⚠️ **重要提醒**:
1. 第一阶段**不实现** SSH/SFTP/shell integration/文件传输
2. 发现需要 electerm 新参考文件时，必须更新 `REUSE_MAP.md`
3. 直接复制代码必须记录到 `PROVENANCE.md` 并保留许可证说明
4. 避免在测试中使用 snapshot 断言终端原始输出（易受 shell prompt 污染）
5. 每个会话测试必须验证：worker pid、sessionId、端口、退出清理

---
