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

const pluginContributesV2Schema = z.object({
  widgetKinds: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  widgets: z.array(z.string().min(1)).default([])
});

const pluginContributesV1CompatSchema = z.object({
  tabKinds: z.array(z.string().min(1)).optional(),
  widgetKinds: z.array(z.string().min(1)).optional(),
  commands: z.array(z.string().min(1)).default([]),
  widgets: z.array(z.string().min(1)).default([])
});

export const pluginManifestV2Schema = z.object({
  manifestVersion: z.literal(2),
  id: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  contributes: pluginContributesV2Schema.default({
    widgetKinds: [],
    commands: [],
    widgets: []
  }),
  permissions: z.array(pluginPermissionSchema).default([])
});

export const pluginManifestV1CompatSchema = z.object({
  manifestVersion: z.literal(1).optional(),
  id: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  contributes: pluginContributesV1CompatSchema.default({
    tabKinds: [],
    widgetKinds: [],
    commands: [],
    widgets: []
  }),
  permissions: z.array(pluginPermissionSchema).default([])
});

export const pluginManifestAnySchema = z
  .union([pluginManifestV2Schema, pluginManifestV1CompatSchema])
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

export const pluginManifestSchema = pluginManifestAnySchema;
export const pluginManifestLatestSchema = pluginManifestV2Schema;

export function normalizePluginManifest(input: unknown): PluginManifestV2 {
  return pluginManifestSchema.parse(input);
}

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
export type PluginManifestV2 = z.infer<typeof pluginManifestV2Schema>;
export type PluginManifestV1Compat = z.infer<typeof pluginManifestV1CompatSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginRpcRequest = z.infer<typeof pluginRpcRequestSchema>;
export type PluginRpcError = z.infer<typeof pluginRpcErrorSchema>;
export type PluginRpcResponse = z.infer<typeof pluginRpcResponseSchema>;
