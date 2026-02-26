# 开发与验证命令（第一阶段约定）

本文件先定义命名规范和用途，脚本会随着实现逐步接通。

## 高频命令

### `pnpm dev`

用途：
- 启动 renderer（Vite）
- 启动 desktop（Electron）

目标状态：
- 一条命令启动开发环境

### `pnpm verify:quick`

用途：
- 日常开发提交前快速验证

应包含：
- `typecheck`
- `lint`
- 核心本地终端 smoke integration

当前实现状态：
- 已接通 `typecheck + test:integration`（lint 暂未接线）

### `pnpm test:integration`

用途：
- 重点验证会话子进程生命周期与 WS 主链路

当前覆盖：
- `create local session -> connect worker WS -> output marker -> resize -> kill`

## 中低频命令

### `pnpm typecheck`

用途：
- 全 workspace TS 类型检查

### `pnpm lint`

用途：
- 代码风格与静态检查

### `pnpm test`

用途：
- unit + integration（不含 E2E）

### `pnpm test:e2e`

用途：
- Electron 端到端测试（低频）

## 排障与维护命令（约定）

### `pnpm debug:sessions`

用途：
- 输出当前 control-plane 会话注册表
- 开发时查看 orphan worker

### `pnpm kill:orphans`

用途：
- 清理遗留 session worker（开发和失败测试后）

## 原生模块构建（node-pty）

如果本地运行集成测试时出现以下错误：

- `Cannot find module .../pty.node`
- `posix_spawnp failed`（且已确认 shell 路径存在）

请先确认 `node-pty` 已编译。

常用处理：

1. `pnpm install`
2. `pnpm rebuild node-pty`（有时不会触发真实编译）
3. 如仍未生成 `pty.node`，在 `node-pty` 包目录手动执行：

```bash
cd node_modules/.pnpm/node-pty@<version>/node_modules/node-pty
npx node-gyp rebuild
```

## 命名原则（固定下来）

1. `verify:*` 表示组合验证命令
2. `test:*` 表示单类测试入口
3. `debug:*` 表示排障辅助命令
4. `kill:*` 表示维护命令（谨慎使用）

## 实施顺序建议

第一批接通：
1. `pnpm dev`
2. `pnpm typecheck`
3. `pnpm test:integration`
4. `pnpm verify:quick`
