import { z } from "zod";

export const fileDialogFilterSchema = z.object({
  name: z.string().min(1),
  extensions: z.array(z.string().min(1)).default([])
});

export const fsPickDirectoryResponseSchema = z.object({
  path: z.string().min(1).nullable()
});

export const fsPickFileRequestSchema = z.object({
  filters: z.array(fileDialogFilterSchema).optional()
});

export const fsPickFileResponseSchema = z.object({
  path: z.string().min(1).nullable()
});

export const fsEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative().nullable()
});

export const fsReadDirRequestSchema = z.object({
  dirPath: z.string().min(1),
  includeHidden: z.boolean().optional()
});

export const fsReadDirResponseSchema = z.object({
  dirPath: z.string().min(1),
  entries: z.array(fsEntrySchema)
});

export const fsReadFileRequestSchema = z.object({
  filePath: z.string().min(1),
  maxBytes: z.number().int().positive().max(8 * 1024 * 1024).optional()
});

export const fsReadFileResponseSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  truncated: z.boolean()
});

export type FileDialogFilter = z.infer<typeof fileDialogFilterSchema>;
export type FsPickDirectoryResponse = z.infer<typeof fsPickDirectoryResponseSchema>;
export type FsPickFileRequest = z.infer<typeof fsPickFileRequestSchema>;
export type FsPickFileResponse = z.infer<typeof fsPickFileResponseSchema>;
export type FsEntry = z.infer<typeof fsEntrySchema>;
export type FsReadDirRequest = z.infer<typeof fsReadDirRequestSchema>;
export type FsReadDirResponse = z.infer<typeof fsReadDirResponseSchema>;
export type FsReadFileRequest = z.infer<typeof fsReadFileRequestSchema>;
export type FsReadFileResponse = z.infer<typeof fsReadFileResponseSchema>;
