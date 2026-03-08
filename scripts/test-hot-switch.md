# Workspace 切换测试指南（Hide-Only）

## 目标

验证 workspace 与 tab 切换行为一致：

- 只切换可见性，不重建 widget
- 不触发 terminal session 重建
- 切回后输出连续、输入可用

## 1. 启动应用

```bash
cd <repo-root>
pnpm dev
```

## 2. 准备场景

1. 在 Workspace A 创建一个 terminal。
2. 执行持续输出命令：

```bash
while true; do date +%s; sleep 1; done
```

3. 记录当前时间戳输出。

## 3. 切换到 Workspace B

1. 打开 `Workspace Menu`。
2. 点击 `New Workspace`。
3. 确认进入空布局。

## 4. 切回 Workspace A（关键）

1. 从侧栏选择 Workspace A。
2. 观察 terminal：
- 输出应继续递增，不应从头开始。
- 不应出现重建导致的空白初始化阶段。

3. 在 terminal 输入：

```bash
echo __WS_SWITCH_OK__
```

4. 预期可立即看到 `__WS_SWITCH_OK__`。

## 5. 多次往返

在 A / B 之间重复切换 5 次，确认：

- terminal 会话持续可用
- 输出不清空
- 输入始终可响应

## 6. 对照项：应用重启（冷启动）

1. 退出应用并重新启动。
2. 预期：layout 从快照恢复；session 是否新建取决于 `restorePolicy` 与当前进程状态。

## 验收标准

- [ ] workspace 切换后 terminal 输出连续
- [ ] workspace 切换后 terminal 输入可用
- [ ] 多次切换后无明显闪屏/重建
- [ ] 冷启动行为与切换行为可区分（切换不重建，冷启动按策略恢复）
