import {
  pluginManifestSchema,
  pluginWidgetInputSchema,
  type PluginWidgetInput
} from "@localterm/shared";
import { FileBrowserPluginView } from "../../components/plugins/FileBrowserPluginView";
import { MarkdownPluginView } from "../../components/plugins/MarkdownPluginView";
import type {
  PluginWidgetContribution,
  PluginWidgetTemplate,
  RendererPlugin
} from "./types";

export const BUILTIN_WORKSPACE_PLUGIN_ID = "builtin.workspace";

const builtinWorkspacePlugin: RendererPlugin = {
  manifest: pluginManifestSchema.parse({
    manifestVersion: 2,
    id: BUILTIN_WORKSPACE_PLUGIN_ID,
    version: "0.1.0",
    entry: "renderer://builtin-workspace-plugin",
    contributes: {
      widgetKinds: ["file.browser", "note.markdown"],
      commands: [],
      widgets: ["file.browser", "note.markdown"]
    },
    permissions: ["workspace.read", "workspace.write", "fs.read"]
  }),
  widgets: [
    {
      pluginId: BUILTIN_WORKSPACE_PLUGIN_ID,
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
      pluginId: BUILTIN_WORKSPACE_PLUGIN_ID,
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

const plugins: RendererPlugin[] = [builtinWorkspacePlugin];

function normalizePluginWidgetId(pluginId: string, widgetId: string) {
  if (pluginId !== BUILTIN_WORKSPACE_PLUGIN_ID) return widgetId;
  if (widgetId === "widget.markdown") return "note.markdown";
  return widgetId;
}

const pluginWidgetMap = new Map<string, PluginWidgetContribution>(
  plugins.flatMap((plugin) =>
    plugin.widgets.map((widget) => {
      const normalizedWidgetId = normalizePluginWidgetId(widget.pluginId, widget.widgetId);
      return [`${widget.pluginId}:${normalizedWidgetId}`, {
        ...widget,
        widgetId: normalizedWidgetId
      }] as const;
    })
  )
);

export function listPluginWidgetTemplates(): PluginWidgetTemplate[] {
  return plugins.flatMap((plugin) =>
    plugin.widgets.map((widget) => ({
      pluginId: plugin.manifest.id,
      widgetId: normalizePluginWidgetId(widget.pluginId, widget.widgetId),
      title: widget.title,
      defaultState: widget.defaultState
    }))
  );
}

export function getPluginWidgetContribution(pluginId: string, widgetId: string) {
  const normalizedWidgetId = normalizePluginWidgetId(pluginId, widgetId);
  return pluginWidgetMap.get(`${pluginId}:${normalizedWidgetId}`) ?? null;
}

export function makePluginWidgetInput(template: PluginWidgetTemplate, state?: Record<string, unknown>): PluginWidgetInput {
  return pluginWidgetInputSchema.parse({
    pluginId: template.pluginId,
    widgetId: normalizePluginWidgetId(template.pluginId, template.widgetId),
    state: {
      ...template.defaultState,
      ...(state ?? {})
    }
  });
}

export function parsePluginWidgetInput(input: unknown): PluginWidgetInput | null {
  const parsed = pluginWidgetInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    widgetId: normalizePluginWidgetId(parsed.data.pluginId, parsed.data.widgetId)
  };
}

// Backward-compatible aliases.
export const listPluginViewTemplates = listPluginWidgetTemplates;
export const getPluginViewContribution = getPluginWidgetContribution;
export const makePluginViewInput = makePluginWidgetInput;
export const parsePluginViewInput = parsePluginWidgetInput;
