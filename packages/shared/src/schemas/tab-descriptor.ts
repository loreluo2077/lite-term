import { z } from "zod";
import { createLocalSessionRequestSchema } from "./control-plane";
import {
  pluginViewWidgetInputSchema,
  pluginViewWidgetSchema,
  terminalLocalWidgetSchema,
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetKindSchema,
  widgetReactWidgetSchema,
  type PluginViewWidgetInput,
  type WidgetDescriptor as SharedWidgetDescriptor
} from "./widget-descriptor";

export const tabKindSchema = widgetKindSchema;

export const tabRestorePolicySchema = z.enum(["recreate", "manual"]);

const sharedDescriptorSchema = {
  id: z.string().min(1),
  title: z.string().min(1),
  customTitle: z.string().min(1).optional(),
  restorePolicy: tabRestorePolicySchema
};

const genericInputSchema = z.record(z.string(), z.unknown());

export const pluginViewTabInputSchema = pluginViewWidgetInputSchema;

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
export type PluginViewTabInput = PluginViewWidgetInput;
export type TabWidgetDescriptor = SharedWidgetDescriptor;
export type TabDescriptor = z.infer<typeof tabDescriptorSchema>;
