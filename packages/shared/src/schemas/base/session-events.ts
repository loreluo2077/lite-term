import { z } from "zod";

export const sessionWorkerReadyEventSchema = z.object({
  type: z.literal("ready"),
  sessionId: z.string().min(1),
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535)
});

export const sessionWorkerExitEventSchema = z.object({
  type: z.literal("exit"),
  sessionId: z.string().min(1),
  exitCode: z.number().int().nullable(),
  signal: z.string().optional()
});

export const sessionWorkerErrorEventSchema = z.object({
  type: z.literal("error"),
  sessionId: z.string().min(1),
  message: z.string().min(1),
  code: z.string().optional()
});

export const sessionWorkerControlEventSchema = z.union([
  sessionWorkerReadyEventSchema,
  sessionWorkerExitEventSchema,
  sessionWorkerErrorEventSchema
]);

export type SessionWorkerReadyEvent = z.infer<typeof sessionWorkerReadyEventSchema>;
export type SessionWorkerExitEvent = z.infer<typeof sessionWorkerExitEventSchema>;
export type SessionWorkerErrorEvent = z.infer<typeof sessionWorkerErrorEventSchema>;
export type SessionWorkerControlEvent = z.infer<typeof sessionWorkerControlEventSchema>;

