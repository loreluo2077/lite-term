import {
  extensionManifestSchema,
  extensionWidgetInputSchema,
  type ExtensionWidgetInput,
  type ExtensionPermission
} from "@localterm/shared";
import type { WidgetTemplate, WidgetTemplateMap } from "./types";

export const BUILTIN_WORKSPACE_EXTENSION_ID = "builtin.workspace";

const builtinWorkspaceManifest = extensionManifestSchema.parse({
  manifestVersion: 2,
  id: BUILTIN_WORKSPACE_EXTENSION_ID,
  version: "0.1.0",
  entry: "localterm-extension://builtin.workspace/manifest.json",
  contributes: {
    widgetKinds: ["terminal.local", "file.browser", "note.markdown", "todo.react"],
    commands: [],
    widgets: ["terminal.local", "file.browser", "note.markdown", "todo.react"]
  },
  permissions: [
    "workspace.read",
    "workspace.write",
    "fs.read",
    "session.list",
    "session.create",
    "session.kill"
  ]
});

const builtinWorkspacePermissions =
  builtinWorkspaceManifest.permissions as ExtensionPermission[];

const builtinTemplates: WidgetTemplate[] = [
  {
    extensionId: BUILTIN_WORKSPACE_EXTENSION_ID,
    widgetId: "terminal.local",
    title: "Terminal",
    defaultState: {
      cols: 120,
      rows: 30,
      sessionId: "",
      port: 0,
      pid: 0,
      status: "idle",
      wsConnected: false,
      startupScripts: []
    },
    permissions: builtinWorkspacePermissions
  },
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
    permissions: builtinWorkspacePermissions
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
    permissions: builtinWorkspacePermissions
  },
  {
    extensionId: BUILTIN_WORKSPACE_EXTENSION_ID,
    widgetId: "todo.react",
    title: "Todo",
    defaultState: {
      todos: [],
      filter: "all",
      draft: ""
    },
    permissions: builtinWorkspacePermissions
  }
];

function normalizeWidgetId(extensionId: string, widgetId: string) {
  if (extensionId !== BUILTIN_WORKSPACE_EXTENSION_ID) return widgetId;
  if (widgetId === "widget.markdown") return "note.markdown";
  return widgetId;
}

const widgetTemplateMap: WidgetTemplateMap = new Map(
  builtinTemplates.map((template) => [
    `${template.extensionId}:${normalizeWidgetId(template.extensionId, template.widgetId)}`,
    {
      ...template,
      widgetId: normalizeWidgetId(template.extensionId, template.widgetId)
    }
  ])
);

export function listWidgetTemplates(): WidgetTemplate[] {
  return [...widgetTemplateMap.values()];
}

export function getWidgetTemplate(extensionId: string, widgetId: string): WidgetTemplate | null {
  const normalizedWidgetId = normalizeWidgetId(extensionId, widgetId);
  return widgetTemplateMap.get(`${extensionId}:${normalizedWidgetId}`) ?? null;
}

export function makeWidgetInput(
  template: WidgetTemplate,
  state?: Record<string, unknown>
): ExtensionWidgetInput {
  return extensionWidgetInputSchema.parse({
    extensionId: template.extensionId,
    widgetId: normalizeWidgetId(template.extensionId, template.widgetId),
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
    widgetId: normalizeWidgetId(parsed.data.extensionId, parsed.data.widgetId)
  };
}

export function buildWebviewWidgetUrl(input: ExtensionWidgetInput) {
  const widgetPath = encodeURIComponent(input.widgetId);
  return `localterm-extension://${encodeURIComponent(input.extensionId)}/widgets/${widgetPath}/index.html`;
}
