# 性能测试方案（Phase 1）

## 目标

验证 local terminal 核心链路在“多会话 + 持续高输出”下的稳定性：

1. 输出是否持续正确
2. 切 tab 是否卡顿
3. 会话是否异常退出
4. worker 进程内存是否异常增长

## 自动化（后端链路压测）

命令：

```bash
pnpm perf:stress
```

可选参数（环境变量）：

- `SESSIONS`：会话数量，默认 `4`
- `DURATION_SEC`：压测时长（秒），默认 `60`
- `BURST_PER_TICK`：每 100ms 打印行数，默认 `120`
- `PAYLOAD_SIZE`：每行 payload 字符数，默认 `140`
- `SAMPLE_INTERVAL_SEC`：内存采样间隔（秒），默认 `5`

示例（10 分钟、6 会话）：

```bash
SESSIONS=6 DURATION_SEC=600 BURST_PER_TICK=120 PAYLOAD_SIZE=140 pnpm perf:stress
```

输出结果：

- 每个 session 的 `outputBytes/outputLines/errorCount`
- 每个 worker pid 的 RSS 采样（`memorySamples`）
- 总输出量与总错误数

## 手工（前端交互压测）

1. 运行 `pnpm dev`
2. 打开 `Perf Panel`，点击 `Start`
3. 点击 `Bulk Stress (4 x 5m)` 一键批量压测
4. 在 tab 间切换，观察吞吐与内存指标
5. 可选：再手工创建额外 tab 增加负载
6. 压测结束点 `Stop`
7. 执行：
   - `pnpm debug:sessions`
   - `pnpm kill:orphans`
8. 如果要自定义后端压力参数，使用 `pnpm perf:stress`（自动化模式）
9. 压测期间不断切 tab，观察：
   - 输出是否持续更新
   - 输入是否持续可用
   - 是否出现冻结、明显掉帧、空白

## 推荐压测命令（在终端中执行）

```bash
node -e 'const end=Date.now()+10*60*1000;let i=0;const payload="x".repeat(140);function tick(){if(Date.now()>end){process.exit(0);return;}for(let j=0;j<120;j++)process.stdout.write(Date.now()+" "+(i++)+" "+payload+"\\n");setTimeout(tick,100);}tick();'
```

## 验收基线

1. 全程无 session 异常退出（`errorCount = 0`）
2. 输出连续无中断，切换后仍可恢复
3. 输入持续有效（不是只执行第一条命令）
4. 无遗留 orphan worker（`pnpm debug:sessions` 中候选为空或可被 `pnpm kill:orphans` 清掉）
