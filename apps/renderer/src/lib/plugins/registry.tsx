import {
  extensionManifestSchema,
  pluginWidgetInputSchema,
  type ExtensionWidgetInput
} from "@localterm/shared";
import { FileBrowserPluginView } from "../../components/plugins/FileBrowserPluginView";
import { MarkdownPluginView } from "../../components/plugins/MarkdownPluginView";
import type {
  WidgetContribution,
  WidgetTemplate,
  RendererExtension
} from "./types";

export const BUILTIN_WORKSPACE_EXTENSION_ID = "builtin.workspace";
// Backward-compatible alias.
export const BUILTIN_WORKSPACE_PLUGIN_ID = BUILTIN_WORKSPACE_EXTENSION_ID;

const builtinWorkspaceExtension: RendererExtension = {
  manifest: extensionManifestSchema.parse({
    manifestVersion: 2,
    id: BUILTIN_WORKSPACE_EXTENSION_ID,
    version: "0.1.0",
    entry: "renderer://builtin-workspace-extension",
    contributes: {
      widgetKinds: ["file.browser", "note.markdown"],
      commands: [],
      widgets: ["file.browser", "note.markdown"]
    },
    permissions: ["workspace.read", "workspace.write", "fs.read"]
  }),
  widgets: [
    {
      extensionId: BUILTIN_WORKSPACE_EXTENSION_ID,
      widgetId: "file.browser",
      title: "Files",
      defaultState: {
        rootPath: "",
        currentPath: "",
        selectedPath: null,
        showHidden: false
      },
      render: (context) => <FileBrowserPluginView {...context} />
    },
    {
      extensionId: BUILTIN_WORKSPACE_EXTENSION_ID,
      widgetId: "note.markdown",
      title: "Markdown",
      defaultState: {
        source: "inline",
        content: "# Notes\n\n",
        mode: "edit"
      },
      render: (context) => <MarkdownPluginView {...context} />
    }
  ]
};

const extensions: RendererExtension[] = [builtinWorkspaceExtension];

function normalizeWidgetId(extensionId: string, widgetId: string) {
  if (extensionId !== BUILTIN_WORKSPACE_EXTENSION_ID) return widgetId;
  if (widgetId === "widget.markdown") return "note.markdown";
  return widgetId;
}

const widgetContributionMap = new Map<string, WidgetContribution>(
  extensions.flatMap((extension) =>
    extension.widgets.map((widget) => {
      const extensionId = widget.extensionId ?? widget.pluginId ?? extension.manifest.id;
      const normalizedWidgetId = normalizeWidgetId(extensionId, widget.widgetId);
      return [`${extensionId}:${normalizedWidgetId}`, {
        ...widget,
        extensionId,
        pluginId: extensionId,
        widgetId: normalizedWidgetId
      }] as const;
    })
  )
);

export function listWidgetTemplates(): WidgetTemplate[] {
  return extensions.flatMap((extension) =>
    extension.widgets.map((widget) => {
      const extensionId = widget.extensionId ?? widget.pluginId ?? extension.manifest.id;
      return {
      extensionId,
      pluginId: extensionId,
      widgetId: normalizeWidgetId(extensionId, widget.widgetId),
      title: widget.title,
      defaultState: widget.defaultState
      };
    })
  );
}

export function getWidgetContribution(extensionId: string, widgetId: string) {
  const normalizedWidgetId = normalizeWidgetId(extensionId, widgetId);
  return widgetContributionMap.get(`${extensionId}:${normalizedWidgetId}`) ?? null;
}

export function makeWidgetInput(template: WidgetTemplate, state?: Record<string, unknown>): ExtensionWidgetInput {
  const extensionId = template.extensionId ?? template.pluginId ?? "";
  return pluginWidgetInputSchema.parse({
    extensionId,
    pluginId: extensionId,
    widgetId: normalizeWidgetId(extensionId, template.widgetId),
    state: {
      ...template.defaultState,
      ...(state ?? {})
    }
  });
}

export function parseWidgetInput(input: unknown): ExtensionWidgetInput | null {
  const parsed = pluginWidgetInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const extensionId = parsed.data.extensionId ?? parsed.data.pluginId;
  if (!extensionId) return null;
  return {
    ...parsed.data,
    extensionId,
    pluginId: extensionId,
    widgetId: normalizeWidgetId(extensionId, parsed.data.widgetId)
  };
}

// Backward-compatible aliases.
export const listWidgetContributions = listWidgetTemplates;
export const getWidgetViewContribution = getWidgetContribution;
export const makeWidgetViewInput = makeWidgetInput;
export const parseWidgetViewInput = parseWidgetInput;
export const listPluginWidgetTemplates = listWidgetTemplates;
export const getPluginWidgetContribution = getWidgetContribution;
export const makePluginWidgetInput = makeWidgetInput;
export const parsePluginWidgetInput = parseWidgetInput;
export const listPluginViewTemplates = listWidgetTemplates;
export const getPluginViewContribution = getWidgetContribution;
export const makePluginViewInput = makeWidgetInput;
export const parsePluginViewInput = parseWidgetInput;
