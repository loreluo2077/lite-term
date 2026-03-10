import { z } from "zod";

export const gitDiffFileStatusSchema = z.enum(["A", "M", "D"]);

export const gitDiffFileSchema = z.object({
  path: z.string().min(1),
  status: gitDiffFileStatusSchema,
  patch: z.string()
});

export const gitReadDiffRequestSchema = z.object({
  path: z.string().min(1)
});

export const gitReadDiffResponseSchema = z.object({
  repoPath: z.string().min(1),
  files: z.array(gitDiffFileSchema)
});

export type GitDiffFileStatus = z.infer<typeof gitDiffFileStatusSchema>;
export type GitDiffFile = z.infer<typeof gitDiffFileSchema>;
export type GitReadDiffRequest = z.infer<typeof gitReadDiffRequestSchema>;
export type GitReadDiffResponse = z.infer<typeof gitReadDiffResponseSchema>;
