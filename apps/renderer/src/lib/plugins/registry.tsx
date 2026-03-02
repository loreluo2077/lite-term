import {
  pluginManifestSchema,
  pluginViewTabInputSchema,
  type PluginViewTabInput
} from "@localterm/shared";
import { FileBrowserPluginView } from "../../components/plugins/FileBrowserPluginView";
import { MarkdownPluginView } from "../../components/plugins/MarkdownPluginView";
import type {
  PluginViewContribution,
  PluginViewTemplate,
  RendererPlugin
} from "./types";

export const BUILTIN_WORKSPACE_PLUGIN_ID = "builtin.workspace";

const builtinWorkspacePlugin: RendererPlugin = {
  manifest: pluginManifestSchema.parse({
    id: BUILTIN_WORKSPACE_PLUGIN_ID,
    version: "0.1.0",
    entry: "renderer://builtin-workspace-plugin",
    contributes: {
      tabKinds: ["plugin.view:file.browser", "plugin.view:widget.markdown"],
      commands: [],
      widgets: ["file.browser", "widget.markdown"]
    },
    permissions: ["workspace.read", "workspace.write", "fs.read"]
  }),
  views: [
    {
      pluginId: BUILTIN_WORKSPACE_PLUGIN_ID,
      viewId: "file.browser",
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
      viewId: "widget.markdown",
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

const pluginViewMap = new Map<string, PluginViewContribution>(
  plugins.flatMap((plugin) =>
    plugin.views.map((view) => [`${view.pluginId}:${view.viewId}`, view] as const)
  )
);

export function listPluginViewTemplates(): PluginViewTemplate[] {
  return plugins.flatMap((plugin) =>
    plugin.views.map((view) => ({
      pluginId: plugin.manifest.id,
      viewId: view.viewId,
      title: view.title,
      defaultState: view.defaultState
    }))
  );
}

export function getPluginViewContribution(pluginId: string, viewId: string) {
  return pluginViewMap.get(`${pluginId}:${viewId}`) ?? null;
}

export function makePluginViewInput(template: PluginViewTemplate, state?: Record<string, unknown>): PluginViewTabInput {
  return pluginViewTabInputSchema.parse({
    pluginId: template.pluginId,
    viewId: template.viewId,
    state: {
      ...template.defaultState,
      ...(state ?? {})
    }
  });
}

export function parsePluginViewInput(input: unknown): PluginViewTabInput | null {
  const parsed = pluginViewTabInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return parsed.data;
}
