import { z } from "zod";

const envRecordSchema = z.record(z.string(), z.string());
export const localSessionStartupScriptSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  delayMs: z.number().int().min(0).max(60 * 60 * 1000).default(0),
  enabled: z.boolean().default(true)
});

export const createLocalSessionRequestSchema = z.object({
  sessionType: z.literal("local"),
  cols: z.number().int().min(1).max(2000),
  rows: z.number().int().min(1).max(2000),
  shell: z.string().min(1).optional(),
  shellArgs: z.array(z.string()).optional(),
  cwd: z.string().min(1).optional(),
  env: envRecordSchema.optional(),
  startupScripts: z.array(localSessionStartupScriptSchema).max(64).optional()
});

export const createLocalSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  pid: z.number().int().positive(),
  status: z.enum(["starting", "ready"])
});

export const resizeSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(1).max(2000),
  rows: z.number().int().min(1).max(2000)
});

export const killSessionRequestSchema = z.object({
  sessionId: z.string().min(1)
});

export const listSessionsResponseSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.string().min(1),
      pid: z.number().int(),
      port: z.number().int().min(1).max(65535),
      status: z.enum(["starting", "ready", "exited", "error"])
    })
  )
});

export const okResponseSchema = z.object({
  ok: z.literal(true)
});

export type CreateLocalSessionRequest = z.infer<typeof createLocalSessionRequestSchema>;
export type LocalSessionStartupScript = z.infer<typeof localSessionStartupScriptSchema>;
export type CreateLocalSessionResponse = z.infer<typeof createLocalSessionResponseSchema>;
export type ResizeSessionRequest = z.infer<typeof resizeSessionRequestSchema>;
export type KillSessionRequest = z.infer<typeof killSessionRequestSchema>;
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;
export type OkResponse = z.infer<typeof okResponseSchema>;
