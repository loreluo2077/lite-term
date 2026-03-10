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

export const sessionWorkerShellReadyEventSchema = z.object({
  type: z.literal("shell-ready"),
  sessionId: z.string().min(1),
  detectedBy: z.enum(["prompt", "fallback"])
});

export const sessionWorkerStartupScriptsStartedEventSchema = z.object({
  type: z.literal("startup-scripts-started"),
  sessionId: z.string().min(1),
  detectedBy: z.enum(["prompt", "fallback"]),
  scriptCount: z.number().int().min(0)
});

export const sessionWorkerStartupScriptsCompleteEventSchema = z.object({
  type: z.literal("startup-scripts-complete"),
  sessionId: z.string().min(1),
  detectedBy: z.enum(["prompt", "fallback"]),
  scriptCount: z.number().int().min(0)
});

export const sessionWorkerStartupScriptsErrorEventSchema = z.object({
  type: z.literal("startup-scripts-error"),
  sessionId: z.string().min(1),
  detectedBy: z.enum(["prompt", "fallback"]),
  message: z.string().min(1)
});

export const sessionWorkerControlEventSchema = z.union([
  sessionWorkerReadyEventSchema,
  sessionWorkerExitEventSchema,
  sessionWorkerErrorEventSchema,
  sessionWorkerShellReadyEventSchema,
  sessionWorkerStartupScriptsStartedEventSchema,
  sessionWorkerStartupScriptsCompleteEventSchema,
  sessionWorkerStartupScriptsErrorEventSchema
]);

export type SessionWorkerReadyEvent = z.infer<typeof sessionWorkerReadyEventSchema>;
export type SessionWorkerExitEvent = z.infer<typeof sessionWorkerExitEventSchema>;
export type SessionWorkerErrorEvent = z.infer<typeof sessionWorkerErrorEventSchema>;
export type SessionWorkerShellReadyEvent = z.infer<typeof sessionWorkerShellReadyEventSchema>;
export type SessionWorkerStartupScriptsStartedEvent = z.infer<typeof sessionWorkerStartupScriptsStartedEventSchema>;
export type SessionWorkerStartupScriptsCompleteEvent = z.infer<typeof sessionWorkerStartupScriptsCompleteEventSchema>;
export type SessionWorkerStartupScriptsErrorEvent = z.infer<typeof sessionWorkerStartupScriptsErrorEventSchema>;
export type SessionWorkerControlEvent = z.infer<typeof sessionWorkerControlEventSchema>;
