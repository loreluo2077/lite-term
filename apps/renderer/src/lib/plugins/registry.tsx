import {
  extensionManifestSchema,
  extensionWidgetInputSchema,
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
      const extensionId = widget.extensionId || extension.manifest.id;
      const normalizedWidgetId = normalizeWidgetId(extensionId, widget.widgetId);
      return [`${extensionId}:${normalizedWidgetId}`, {
        ...widget,
        extensionId,
        widgetId: normalizedWidgetId
      }] as const;
    })
  )
);

export function listWidgetTemplates(): WidgetTemplate[] {
  return extensions.flatMap((extension) =>
    extension.widgets.map((widget) => {
      const extensionId = widget.extensionId || extension.manifest.id;
      return {
        extensionId,
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
  const extensionId = template.extensionId;
  return extensionWidgetInputSchema.parse({
    extensionId,
    widgetId: normalizeWidgetId(extensionId, template.widgetId),
    state: {
      ...template.defaultState,
      ...(state ?? {})
    }
  });
}

export function parseWidgetInput(input: unknown): ExtensionWidgetInput | null {
  const parsed = extensionWidgetInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    extensionId: parsed.data.extensionId,
    widgetId: normalizeWidgetId(parsed.data.extensionId, parsed.data.widgetId)
  };
}
