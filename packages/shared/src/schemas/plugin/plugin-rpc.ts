import { z } from "zod";

export const extensionPermissionSchema = z.enum([
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

const extensionContributesSchema = z.object({
  widgetKinds: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  widgets: z.array(z.string().min(1)).default([])
});

export const extensionManifestV2Schema = z.object({
  manifestVersion: z.literal(2),
  id: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  contributes: extensionContributesSchema.default({
    widgetKinds: [],
    commands: [],
    widgets: []
  }),
  permissions: z.array(extensionPermissionSchema).default([])
});

export const extensionManifestSchema = extensionManifestV2Schema;
export const extensionManifestLatestSchema = extensionManifestV2Schema;

export function normalizeExtensionManifest(input: unknown): ExtensionManifestV2 {
  return extensionManifestSchema.parse(input);
}

export const extensionRpcRequestSchema = z.object({
  requestId: z.string().min(1),
  extensionId: z.string().min(1),
  method: z.string().min(1),
  params: z.unknown().optional()
});

export const extensionRpcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  missingPermission: extensionPermissionSchema.optional()
});

export const extensionRpcResponseSchema = z
  .object({
    requestId: z.string().min(1),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: extensionRpcErrorSchema.optional()
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

export type ExtensionPermission = z.infer<typeof extensionPermissionSchema>;
export type ExtensionManifestV2 = z.infer<typeof extensionManifestV2Schema>;
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
export type ExtensionRpcRequest = z.infer<typeof extensionRpcRequestSchema>;
export type ExtensionRpcError = z.infer<typeof extensionRpcErrorSchema>;
export type ExtensionRpcResponse = z.infer<typeof extensionRpcResponseSchema>;
