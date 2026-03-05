import { z } from "zod";
import { createLocalSessionRequestSchema } from "../base/control-plane";
import {
  fileBrowserWidgetSchema,
  noteMarkdownWidgetSchema,
  pluginWidgetInputSchema,
  pluginWidgetSchema,
  pluginViewWidgetSchema,
  terminalLocalWidgetSchema,
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetKindSchema,
  widgetReactWidgetSchema,
  type ExtensionWidgetInput,
  type PluginWidgetInput,
  type WidgetDescriptor as SharedWidgetDescriptor,
  type WidgetKind
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

export const pluginWidgetTabInputSchema = pluginWidgetInputSchema;
export const pluginViewTabInputSchema = pluginWidgetTabInputSchema;

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

const pluginWidgetTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("plugin.widget"),
  input: pluginWidgetTabInputSchema,
  widget: pluginWidgetSchema.optional()
});

const pluginViewTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("plugin.view"),
  input: pluginWidgetTabInputSchema,
  widget: pluginViewWidgetSchema.optional()
});

const fileBrowserTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("file.browser"),
  input: pluginWidgetTabInputSchema,
  widget: fileBrowserWidgetSchema.optional()
});

const noteMarkdownTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  tabKind: z.literal("note.markdown"),
  input: pluginWidgetTabInputSchema,
  widget: noteMarkdownWidgetSchema.optional()
});

export const legacyTabDescriptorSchema = z.discriminatedUnion("tabKind", [
  terminalLocalTabDescriptorSchema,
  terminalSshTabDescriptorSchema,
  webPageTabDescriptorSchema,
  webBrowserTabDescriptorSchema,
  widgetReactTabDescriptorSchema,
  pluginWidgetTabDescriptorSchema,
  pluginViewTabDescriptorSchema,
  fileBrowserTabDescriptorSchema,
  noteMarkdownTabDescriptorSchema
]);

export const widgetTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  widget: z.discriminatedUnion("kind", [
    terminalLocalWidgetSchema,
    terminalSshWidgetSchema,
    webPageWidgetSchema,
    webBrowserWidgetSchema,
    widgetReactWidgetSchema,
    pluginWidgetSchema,
    pluginViewWidgetSchema,
    fileBrowserWidgetSchema,
    noteMarkdownWidgetSchema
  ])
});

export const tabDescriptorSchema = z.union([
  widgetTabDescriptorSchema,
  legacyTabDescriptorSchema
]);

const BUILTIN_WORKSPACE_EXTENSION_ID = "builtin.workspace";

function mapPluginWidgetInputToWidgetKind(input: ExtensionWidgetInput): WidgetKind {
  if (input.extensionId !== BUILTIN_WORKSPACE_EXTENSION_ID) return "plugin.widget";
  if (input.widgetId === "file.browser") return "file.browser";
  if (input.widgetId === "widget.markdown") return "note.markdown";
  if (input.widgetId === "note.markdown") return "note.markdown";
  return "plugin.widget";
}

function normalizePluginWidgetInput(input: ExtensionWidgetInput): ExtensionWidgetInput {
  if (input.extensionId !== BUILTIN_WORKSPACE_EXTENSION_ID) return input;
  if (input.widgetId === "widget.markdown") {
    return {
      ...input,
      widgetId: "note.markdown"
    };
  }
  return input;
}

function normalizePluginWidgetDescriptor(input: ExtensionWidgetInput): SharedWidgetDescriptor {
  const normalizedInput = normalizePluginWidgetInput(input);
  const mappedKind = mapPluginWidgetInputToWidgetKind(normalizedInput);
  return {
    kind: mappedKind,
    input: normalizedInput
  } as SharedWidgetDescriptor;
}

function resolveLegacyWidgetDescriptor(descriptor: LegacyTabDescriptor): SharedWidgetDescriptor {
  const candidate = descriptor.widget;
  if (descriptor.tabKind === "plugin.view" || descriptor.tabKind === "plugin.widget") {
    if (candidate) {
      const parsedCandidate = pluginWidgetTabInputSchema.safeParse(candidate.input);
      if (parsedCandidate.success) {
        return normalizePluginWidgetDescriptor(parsedCandidate.data);
      }
    }
    const parsedInput = pluginWidgetTabInputSchema.safeParse(descriptor.input);
    if (parsedInput.success) {
      return normalizePluginWidgetDescriptor(parsedInput.data);
    }
    return {
      kind: "plugin.widget",
      input: descriptor.input
    } as SharedWidgetDescriptor;
  }

  if (candidate && candidate.kind === descriptor.tabKind) {
    return candidate;
  }

  if (descriptor.tabKind === "file.browser" || descriptor.tabKind === "note.markdown") {
    const parsed = pluginWidgetTabInputSchema.safeParse(descriptor.input);
    if (parsed.success) {
      return normalizePluginWidgetDescriptor(parsed.data);
    }
  }

  return {
    kind: descriptor.tabKind,
    input: descriptor.input
  } as SharedWidgetDescriptor;
}

export function isLegacyTabDescriptor(descriptor: TabDescriptor): descriptor is LegacyTabDescriptor {
  return "tabKind" in descriptor;
}

export function resolveWidgetDescriptorFromTabDescriptor(descriptor: TabDescriptor): SharedWidgetDescriptor {
  if (isLegacyTabDescriptor(descriptor)) {
    return resolveLegacyWidgetDescriptor(descriptor);
  }

  const widget = descriptor.widget;
  if (widget.kind === "plugin.view" || widget.kind === "plugin.widget" || widget.kind === "file.browser" || widget.kind === "note.markdown") {
    const parsed = pluginWidgetTabInputSchema.safeParse(widget.input);
    if (parsed.success) {
      return normalizePluginWidgetDescriptor(parsed.data);
    }
  }
  return widget;
}

export function normalizeLegacyTabDescriptor(descriptor: LegacyTabDescriptor): WidgetTabDescriptor {
  return {
    id: descriptor.id,
    title: descriptor.title,
    ...(descriptor.customTitle ? { customTitle: descriptor.customTitle } : {}),
    restorePolicy: descriptor.restorePolicy,
    widget: resolveLegacyWidgetDescriptor(descriptor)
  };
}

export function normalizeWidgetTabDescriptor(descriptor: WidgetTabDescriptor): WidgetTabDescriptor {
  return {
    id: descriptor.id,
    title: descriptor.title,
    ...(descriptor.customTitle ? { customTitle: descriptor.customTitle } : {}),
    restorePolicy: descriptor.restorePolicy,
    widget: resolveWidgetDescriptorFromTabDescriptor(descriptor)
  };
}

export type TabKind = z.infer<typeof tabKindSchema>;
export type TabRestorePolicy = z.infer<typeof tabRestorePolicySchema>;
export type PluginWidgetTabInput = PluginWidgetInput;
export type PluginViewTabInput = PluginWidgetTabInput;
export type TabWidgetDescriptor = SharedWidgetDescriptor;
export type LegacyTabDescriptor = z.infer<typeof legacyTabDescriptorSchema>;
export type WidgetTabDescriptor = z.infer<typeof widgetTabDescriptorSchema>;
export type TabDescriptor = z.infer<typeof tabDescriptorSchema>;
