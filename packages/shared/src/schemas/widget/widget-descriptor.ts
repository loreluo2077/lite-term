import { z } from "zod";
import { createLocalSessionRequestSchema } from "../base/control-plane";

export const widgetKindSchema = z.enum([
  "terminal.local",
  "terminal.ssh",
  "web.page",
  "web.browser",
  "widget.react",
  "plugin.widget",
  "plugin.view",
  "file.browser",
  "note.markdown"
]);

export const genericWidgetInputSchema = z.record(z.string(), z.unknown());

const pluginWidgetInputRawSchema = z.object({
  extensionId: z.string().min(1).optional(),
  // Legacy compatibility field.
  pluginId: z.string().min(1).optional(),
  widgetId: z.string().min(1).optional(),
  // Legacy compatibility field.
  viewId: z.string().min(1).optional(),
  state: z.record(z.string(), z.unknown()).default({})
});

export const pluginWidgetInputSchema = pluginWidgetInputRawSchema
  .superRefine((value, ctx) => {
    if (!value.extensionId && !value.pluginId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["extensionId"],
        message: "extensionId is required (or provide legacy pluginId)"
      });
    }
    if (!value.widgetId && !value.viewId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["widgetId"],
        message: "widgetId is required (or provide legacy viewId)"
      });
    }
  })
  .transform((value) => ({
    extensionId: value.extensionId ?? value.pluginId ?? "",
    // Keep legacy field in normalized output during migration.
    pluginId: value.extensionId ?? value.pluginId ?? "",
    widgetId: value.widgetId ?? value.viewId ?? "",
    state: value.state
  }));

// Backward-compatible alias.
export const pluginViewWidgetInputSchema = pluginWidgetInputSchema;

export const terminalLocalWidgetSchema = z.object({
  kind: z.literal("terminal.local"),
  input: createLocalSessionRequestSchema.omit({ sessionType: true })
});

export const terminalSshWidgetSchema = z.object({
  kind: z.literal("terminal.ssh"),
  input: genericWidgetInputSchema
});

export const webPageWidgetSchema = z.object({
  kind: z.literal("web.page"),
  input: genericWidgetInputSchema
});

export const webBrowserWidgetSchema = z.object({
  kind: z.literal("web.browser"),
  input: genericWidgetInputSchema
});

export const widgetReactWidgetSchema = z.object({
  kind: z.literal("widget.react"),
  input: genericWidgetInputSchema
});

export const pluginWidgetSchema = z.object({
  kind: z.literal("plugin.widget"),
  input: pluginWidgetInputSchema
});

export const pluginViewWidgetSchema = z.object({
  kind: z.literal("plugin.view"),
  input: pluginWidgetInputSchema
});

export const fileBrowserWidgetSchema = z.object({
  kind: z.literal("file.browser"),
  input: pluginWidgetInputSchema
});

export const noteMarkdownWidgetSchema = z.object({
  kind: z.literal("note.markdown"),
  input: pluginWidgetInputSchema
});

export const widgetDescriptorSchema = z.discriminatedUnion("kind", [
  terminalLocalWidgetSchema,
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetReactWidgetSchema,
  pluginWidgetSchema,
  pluginViewWidgetSchema,
  fileBrowserWidgetSchema,
  noteMarkdownWidgetSchema
]);

export type WidgetKind = z.infer<typeof widgetKindSchema>;
export type ExtensionWidgetInput = z.infer<typeof pluginWidgetInputSchema>;
export type PluginWidgetInput = ExtensionWidgetInput;
// Backward-compatible alias.
export type PluginViewWidgetInput = PluginWidgetInput;
export type WidgetDescriptor = z.infer<typeof widgetDescriptorSchema>;
