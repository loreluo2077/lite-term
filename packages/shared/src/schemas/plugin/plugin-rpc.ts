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

const extensionContributesV2Schema = z.object({
  widgetKinds: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  widgets: z.array(z.string().min(1)).default([])
});

const extensionContributesV1CompatSchema = z.object({
  tabKinds: z.array(z.string().min(1)).optional(),
  widgetKinds: z.array(z.string().min(1)).optional(),
  commands: z.array(z.string().min(1)).default([]),
  widgets: z.array(z.string().min(1)).default([])
});

export const extensionManifestV2Schema = z.object({
  manifestVersion: z.literal(2),
  id: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  contributes: extensionContributesV2Schema.default({
    widgetKinds: [],
    commands: [],
    widgets: []
  }),
  permissions: z.array(extensionPermissionSchema).default([])
});

export const extensionManifestV1CompatSchema = z.object({
  manifestVersion: z.literal(1).optional(),
  id: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  contributes: extensionContributesV1CompatSchema.default({
    tabKinds: [],
    widgetKinds: [],
    commands: [],
    widgets: []
  }),
  permissions: z.array(extensionPermissionSchema).default([])
});

export const extensionManifestAnySchema = z
  .union([extensionManifestV2Schema, extensionManifestV1CompatSchema])
  .transform((value) => {
    if (value.manifestVersion === 2) {
      return value;
    }
    return {
      manifestVersion: 2 as const,
      id: value.id,
      version: value.version,
      entry: value.entry,
      contributes: {
        widgetKinds: value.contributes.widgetKinds ?? value.contributes.tabKinds ?? [],
        commands: value.contributes.commands,
        widgets: value.contributes.widgets
      },
      permissions: value.permissions
    };
  });

export const extensionManifestSchema = extensionManifestAnySchema;
export const extensionManifestLatestSchema = extensionManifestV2Schema;

export function normalizeExtensionManifest(input: unknown): ExtensionManifestV2 {
  return extensionManifestSchema.parse(input);
}

export const extensionRpcRequestSchema = z
  .object({
  requestId: z.string().min(1),
    extensionId: z.string().min(1).optional(),
    // Legacy compatibility field.
    pluginId: z.string().min(1).optional(),
  method: z.string().min(1),
  params: z.unknown().optional()
  })
  .superRefine((value, ctx) => {
    if (value.extensionId || value.pluginId) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["extensionId"],
      message: "extensionId is required (or provide legacy pluginId)"
    });
  })
  .transform((value) => {
    const extensionId = value.extensionId ?? value.pluginId ?? "";
    return {
      ...value,
      extensionId,
      pluginId: extensionId
    };
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
export type ExtensionManifestV1Compat = z.infer<typeof extensionManifestV1CompatSchema>;
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
export type ExtensionRpcRequest = z.infer<typeof extensionRpcRequestSchema>;
export type ExtensionRpcError = z.infer<typeof extensionRpcErrorSchema>;
export type ExtensionRpcResponse = z.infer<typeof extensionRpcResponseSchema>;

// Backward-compatible aliases (plugin -> extension terminology migration).
export const pluginPermissionSchema = extensionPermissionSchema;
export const pluginManifestV2Schema = extensionManifestV2Schema;
export const pluginManifestV1CompatSchema = extensionManifestV1CompatSchema;
export const pluginManifestAnySchema = extensionManifestAnySchema;
export const pluginManifestSchema = extensionManifestSchema;
export const pluginManifestLatestSchema = extensionManifestLatestSchema;
export const pluginRpcRequestSchema = extensionRpcRequestSchema;
export const pluginRpcErrorSchema = extensionRpcErrorSchema;
export const pluginRpcResponseSchema = extensionRpcResponseSchema;
export const normalizePluginManifest = normalizeExtensionManifest;

export type PluginPermission = ExtensionPermission;
export type PluginManifestV2 = ExtensionManifestV2;
export type PluginManifestV1Compat = ExtensionManifestV1Compat;
export type PluginManifest = ExtensionManifest;
export type PluginRpcRequest = ExtensionRpcRequest;
export type PluginRpcError = ExtensionRpcError;
export type PluginRpcResponse = ExtensionRpcResponse;
