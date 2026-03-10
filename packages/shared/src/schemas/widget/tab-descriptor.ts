import { z } from "zod";
import {
  diffReviewWidgetSchema,
  extensionWidgetInputSchema,
  extensionWidgetSchema,
  fileBrowserWidgetSchema,
  noteMarkdownWidgetSchema,
  commandSnippetsWidgetSchema,
  terminalSshWidgetSchema,
  webPageWidgetSchema,
  webBrowserWidgetSchema,
  widgetKindSchema,
  widgetReactWidgetSchema,
  type ExtensionWidgetInput,
  type WidgetDescriptor as SharedWidgetDescriptor,
  type WidgetKind
} from "./widget-descriptor";

export const tabRestorePolicySchema = z.enum(["recreate", "manual"]);

const sharedDescriptorSchema = {
  id: z.string().min(1),
  title: z.string().min(1),
  customTitle: z.string().min(1).optional(),
  restorePolicy: tabRestorePolicySchema
};

export const widgetTabDescriptorSchema = z.object({
  ...sharedDescriptorSchema,
  widget: z.discriminatedUnion("kind", [
    terminalSshWidgetSchema,
    webPageWidgetSchema,
    webBrowserWidgetSchema,
    widgetReactWidgetSchema,
    extensionWidgetSchema,
    fileBrowserWidgetSchema,
    diffReviewWidgetSchema,
    noteMarkdownWidgetSchema,
    commandSnippetsWidgetSchema
  ])
});

export const tabDescriptorSchema = widgetTabDescriptorSchema;

const BUILTIN_WORKSPACE_EXTENSION_ID = "builtin.workspace";

function mapExtensionWidgetInputToWidgetKind(input: ExtensionWidgetInput): WidgetKind {
  if (input.extensionId !== BUILTIN_WORKSPACE_EXTENSION_ID) return "extension.widget";
  if (input.widgetId === "file.browser") return "file.browser";
  if (input.widgetId === "diff.review") return "diff.review";
  if (input.widgetId === "command-snippets") return "command-snippets";
  if (input.widgetId === "widget.markdown") return "note.markdown";
  if (input.widgetId === "note.markdown") return "note.markdown";
  return "extension.widget";
}

function normalizeExtensionWidgetInput(input: ExtensionWidgetInput): ExtensionWidgetInput {
  if (input.extensionId !== BUILTIN_WORKSPACE_EXTENSION_ID) return input;
  if (input.widgetId === "widget.markdown") {
    return {
      ...input,
      widgetId: "note.markdown"
    };
  }
  return input;
}

function normalizeExtensionWidgetDescriptor(input: ExtensionWidgetInput): SharedWidgetDescriptor {
  const normalizedInput = normalizeExtensionWidgetInput(input);
  return {
    kind: mapExtensionWidgetInputToWidgetKind(normalizedInput),
    input: normalizedInput
  } as SharedWidgetDescriptor;
}

function normalizeWidgetDescriptor(widget: SharedWidgetDescriptor): SharedWidgetDescriptor {
  if (
    widget.kind === "extension.widget" ||
    widget.kind === "file.browser" ||
    widget.kind === "diff.review" ||
    widget.kind === "note.markdown" ||
    widget.kind === "command-snippets"
  ) {
    const parsed = extensionWidgetInputSchema.safeParse(widget.input);
    if (parsed.success) {
      return normalizeExtensionWidgetDescriptor(parsed.data);
    }
  }
  return widget;
}

export function resolveWidgetDescriptorFromTabDescriptor(
  descriptor: WidgetTabDescriptor
): SharedWidgetDescriptor {
  return normalizeWidgetDescriptor(descriptor.widget);
}

export function normalizeWidgetTabDescriptor(
  descriptor: WidgetTabDescriptor
): WidgetTabDescriptor {
  return {
    id: descriptor.id,
    title: descriptor.title,
    ...(descriptor.customTitle ? { customTitle: descriptor.customTitle } : {}),
    restorePolicy: descriptor.restorePolicy,
    widget: resolveWidgetDescriptorFromTabDescriptor(descriptor)
  };
}

export type TabRestorePolicy = z.infer<typeof tabRestorePolicySchema>;
export type TabWidgetDescriptor = SharedWidgetDescriptor;
export type WidgetTabDescriptor = z.infer<typeof widgetTabDescriptorSchema>;
export type TabDescriptor = z.infer<typeof tabDescriptorSchema>;
