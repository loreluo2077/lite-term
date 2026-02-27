import { z } from "zod";

export const workerRssSampleSchema = z.object({
  sessionId: z.string().min(1),
  pid: z.number().int(),
  status: z.enum(["starting", "ready", "exited", "error"]),
  rssKb: z.number().int().nonnegative().nullable()
});

export const systemMetricsResponseSchema = z.object({
  timestamp: z.string(),
  main: z.object({
    pid: z.number().int().positive(),
    rss: z.number().int().nonnegative(),
    heapUsed: z.number().int().nonnegative(),
    heapTotal: z.number().int().nonnegative(),
    external: z.number().int().nonnegative()
  }),
  workers: z.array(workerRssSampleSchema),
  workersTotalRssKb: z.number().int().nonnegative()
});

export type WorkerRssSample = z.infer<typeof workerRssSampleSchema>;
export type SystemMetricsResponse = z.infer<typeof systemMetricsResponseSchema>;
