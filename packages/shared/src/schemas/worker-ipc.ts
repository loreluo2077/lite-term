import { z } from "zod";
import { createLocalSessionRequestSchema } from "./control-plane";

export const workerBootstrapMessageSchema = z.object({
  type: z.literal("worker:init"),
  payload: z.object({
    sessionId: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    host: z.string().min(1).default("127.0.0.1"),
    request: createLocalSessionRequestSchema
  })
});

export const workerResizeMessageSchema = z.object({
  type: z.literal("worker:resize"),
  payload: z.object({
    cols: z.number().int().min(1).max(2000),
    rows: z.number().int().min(1).max(2000)
  })
});

export const workerKillMessageSchema = z.object({
  type: z.literal("worker:kill")
});

export const workerParentToChildMessageSchema = z.union([
  workerBootstrapMessageSchema,
  workerResizeMessageSchema,
  workerKillMessageSchema
]);

export const workerReadyToParentMessageSchema = z.object({
  type: z.literal("worker:ready"),
  payload: z.object({
    sessionId: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    pid: z.number().int().positive()
  })
});

export const workerErrorToParentMessageSchema = z.object({
  type: z.literal("worker:error"),
  payload: z.object({
    sessionId: z.string().min(1),
    message: z.string().min(1),
    code: z.string().optional()
  })
});

export const workerChildToParentMessageSchema = z.union([
  workerReadyToParentMessageSchema,
  workerErrorToParentMessageSchema
]);

export type WorkerBootstrapMessage = z.infer<typeof workerBootstrapMessageSchema>;
export type WorkerResizeMessage = z.infer<typeof workerResizeMessageSchema>;
export type WorkerKillMessage = z.infer<typeof workerKillMessageSchema>;
export type WorkerParentToChildMessage = z.infer<typeof workerParentToChildMessageSchema>;
export type WorkerReadyToParentMessage = z.infer<typeof workerReadyToParentMessageSchema>;
export type WorkerErrorToParentMessage = z.infer<typeof workerErrorToParentMessageSchema>;
export type WorkerChildToParentMessage = z.infer<typeof workerChildToParentMessageSchema>;

