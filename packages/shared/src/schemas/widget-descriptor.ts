import { z } from "zod";
import { createLocalSessionRequestSchema } from "./control-plane";

export const widgetKindSchema = z.enum([
  "terminal.local",
  "terminal.ssh",
  "web.page",
  "web.browser",
  "widget.react",
  "plugin.view"
]);

export const genericWidgetInputSchema = z.record(z.string(), z.unknown());

export const pluginViewWidgetInputSchema = z.object({
  pluginId: z.string().min(1),
  viewId: z.string().min(1),
  state: z.record(z.string(), z.unknown()).default({})
});

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

export const pluginViewWidgetSchema = z.object({
  kind: z.literal("plugin.view"),
  input: pluginViewWidgetInputSchema
});

export const widgetDescriptorSchema = z.discriminatedUnion("kind", [
  terminalLocalWidgetSchema,
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetReactWidgetSchema,
  pluginViewWidgetSchema
]);

export type WidgetKind = z.infer<typeof widgetKindSchema>;
export type PluginViewWidgetInput = z.infer<typeof pluginViewWidgetInputSchema>;
export type WidgetDescriptor = z.infer<typeof widgetDescriptorSchema>;
