import { z } from "zod";

export const pluginPermissionSchema = z.enum([
  "workspace.read",
  "workspace.write",
  "session.list",
  "session.create",
  "session.kill",
  "network.request",
  "fs.read",
  "fs.write",
  "shell.exec"
]);

export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  contributes: z
    .object({
      tabKinds: z.array(z.string().min(1)).default([]),
      commands: z.array(z.string().min(1)).default([]),
      widgets: z.array(z.string().min(1)).default([])
    })
    .default({ tabKinds: [], commands: [], widgets: [] }),
  permissions: z.array(pluginPermissionSchema).default([])
});

export const pluginRpcRequestSchema = z.object({
  requestId: z.string().min(1),
  pluginId: z.string().min(1),
  method: z.string().min(1),
  params: z.unknown().optional()
});

export const pluginRpcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  missingPermission: pluginPermissionSchema.optional()
});

export const pluginRpcResponseSchema = z
  .object({
    requestId: z.string().min(1),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: pluginRpcErrorSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.ok && value.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "error must be absent when ok=true"
      });
    }
    if (!value.ok && !value.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "error is required when ok=false"
      });
    }
  });

export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginRpcRequest = z.infer<typeof pluginRpcRequestSchema>;
export type PluginRpcError = z.infer<typeof pluginRpcErrorSchema>;
export type PluginRpcResponse = z.infer<typeof pluginRpcResponseSchema>;
