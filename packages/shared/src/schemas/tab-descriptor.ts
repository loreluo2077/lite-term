import { z } from "zod";
import { createLocalSessionRequestSchema } from "./control-plane";

export const tabKindSchema = z.enum([
  "terminal.local",
  "terminal.ssh",
  "web.page",
  "web.browser",
  "widget.react",
  "plugin.view"
]);

export const tabRestorePolicySchema = z.enum(["recreate", "manual"]);

const sharedDescriptorSchema = {
  id: z.string().min(1),
  title: z.string().min(1),
  customTitle: z.string().min(1).optional(),
  restorePolicy: tabRestorePolicySchema
};

const genericInputSchema = z.record(z.string(), z.unknown());

export const pluginViewTabInputSchema = z.object({
  pluginId: z.string().min(1),
  viewId: z.string().min(1),
  state: z.record(z.string(), z.unknown()).default({})
});

const terminalLocalWidgetSchema = z.object({
  kind: z.literal("terminal.local"),
  input: createLocalSessionRequestSchema.omit({ sessionType: true })
});

const terminalSshWidgetSchema = z.object({
  kind: z.literal("terminal.ssh"),
  input: genericInputSchema
});

const webPageWidgetSchema = z.object({
  kind: z.literal("web.page"),
  input: genericInputSchema
});

const webBrowserWidgetSchema = z.object({
  kind: z.literal("web.browser"),
  input: genericInputSchema
});

const widgetReactWidgetSchema = z.object({
  kind: z.literal("widget.react"),
  input: genericInputSchema
});

const pluginViewWidgetSchema = z.object({
  kind: z.literal("plugin.view"),
  input: pluginViewTabInputSchema
});

export const widgetDescriptorSchema = z.discriminatedUnion("kind", [
  terminalLocalWidgetSchema,
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetReactWidgetSchema,
  pluginViewWidgetSchema
]);

const terminalLocalTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("terminal.local"),
  input: createLocalSessionRequestSchema.omit({ sessionType: true }),
  widget: terminalLocalWidgetSchema.optional()
});

const terminalSshTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("terminal.ssh"),
  input: genericInputSchema,
  widget: terminalSshWidgetSchema.optional()
});

const webPageTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("web.page"),
  input: genericInputSchema,
  widget: webPageWidgetSchema.optional()
});

const webBrowserTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("web.browser"),
  input: genericInputSchema,
  widget: webBrowserWidgetSchema.optional()
});

const widgetReactTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("widget.react"),
  input: genericInputSchema,
  widget: widgetReactWidgetSchema.optional()
});

const pluginViewTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("plugin.view"),
  input: pluginViewTabInputSchema,
  widget: pluginViewWidgetSchema.optional()
});

export const tabDescriptorSchema = z.discriminatedUnion("tabKind", [
  terminalLocalTabDescriptorSchema,
  terminalSshTabDescriptorSchema,
  webPageTabDescriptorSchema,
  webBrowserTabDescriptorSchema,
  widgetReactTabDescriptorSchema,
  pluginViewTabDescriptorSchema
]);

export type TabKind = z.infer<typeof tabKindSchema>;
export type TabRestorePolicy = z.infer<typeof tabRestorePolicySchema>;
export type PluginViewTabInput = z.infer<typeof pluginViewTabInputSchema>;
export type WidgetDescriptor = z.infer<typeof widgetDescriptorSchema>;
export type TabDescriptor = z.infer<typeof tabDescriptorSchema>;
