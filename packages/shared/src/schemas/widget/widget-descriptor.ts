import { z } from "zod";

export const widgetKindSchema = z.enum([
  "terminal.ssh",
  "web.page",
  "web.browser",
  "widget.react",
  "extension.widget",
  "file.browser",
  "note.markdown"
]);

export const genericWidgetInputSchema = z.record(z.string(), z.unknown());

export const extensionWidgetInputSchema = z.object({
  extensionId: z.string().min(1),
  widgetId: z.string().min(1),
  state: z.record(z.string(), z.unknown()).default({})
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

export const extensionWidgetSchema = z.object({
  kind: z.literal("extension.widget"),
  input: extensionWidgetInputSchema
});

export const fileBrowserWidgetSchema = z.object({
  kind: z.literal("file.browser"),
  input: extensionWidgetInputSchema
});

export const noteMarkdownWidgetSchema = z.object({
  kind: z.literal("note.markdown"),
  input: extensionWidgetInputSchema
});

export const widgetDescriptorSchema = z.discriminatedUnion("kind", [
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetReactWidgetSchema,
  extensionWidgetSchema,
  fileBrowserWidgetSchema,
  noteMarkdownWidgetSchema
]);

export type WidgetKind = z.infer<typeof widgetKindSchema>;
export type ExtensionWidgetInput = z.infer<typeof extensionWidgetInputSchema>;
export type WidgetDescriptor = z.infer<typeof widgetDescriptorSchema>;
