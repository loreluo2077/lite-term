import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkspaceSnapshot,
  pluginManifestSchema,
  pluginRpcResponseSchema,
  workspaceSnapshotSchema
} from "@localterm/shared";

test("workspace snapshot schema accepts valid v2 payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 2,
      id: "default",
      name: "Default",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      },
      overlays: {
        floatingPanels: [],
        commandRadial: {
          enabled: false,
          hotkey: "Ctrl+K"
        }
      }
    },
    tabs: [
      {
        id: "tab-1",
        tabKind: "terminal.local",
        title: "Local 1",
        input: { cols: 120, rows: 30 },
        restorePolicy: "recreate"
      }
    ]
  });

  assert.equal(parsed.layout.schemaVersion, 2);
  assert.equal(parsed.tabs.length, 1);
});

test("workspace snapshot schema accepts plugin.view state payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 2,
      id: "study",
      name: "Study",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-plugin-1"],
        activeTabId: "tab-plugin-1"
      }
    },
    tabs: [
      {
        id: "tab-plugin-1",
        tabKind: "plugin.view",
        title: "Markdown",
        input: {
          pluginId: "builtin.workspace",
          viewId: "widget.markdown",
          state: {
            source: "inline",
            content: "# Notes"
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  assert.ok(parsed.tabs[0] && "tabKind" in parsed.tabs[0]);
  if (!parsed.tabs[0] || !("tabKind" in parsed.tabs[0])) return;
  assert.equal(parsed.tabs[0].tabKind, "plugin.view");
});

test("workspace snapshot schema accepts terminal startup scripts payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 2,
      id: "scripts",
      name: "scripts",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      }
    },
    tabs: [
      {
        id: "tab-1",
        tabKind: "terminal.local",
        title: "Local 1",
        input: {
          cols: 120,
          rows: 30,
          startupScripts: [
            {
              id: "script-1",
              command: "echo ready",
              delayMs: 500,
              enabled: true
            }
          ]
        },
        restorePolicy: "recreate"
      }
    ]
  });

  assert.ok(parsed.tabs[0] && "tabKind" in parsed.tabs[0]);
  if (!parsed.tabs[0] || !("tabKind" in parsed.tabs[0])) return;
  if (parsed.tabs[0].tabKind !== "terminal.local") return;
  assert.equal(parsed.tabs[0].input.startupScripts.length, 1);
  assert.equal(parsed.tabs[0].input.startupScripts[0]?.command, "echo ready");
});

test("workspace snapshot schema accepts tab.widget payload (tab shell + widget content)", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 2,
      id: "widgetized",
      name: "widgetized",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      }
    },
    tabs: [
      {
        id: "tab-1",
        tabKind: "terminal.local",
        title: "Local 1",
        input: { cols: 120, rows: 30 },
        widget: {
          kind: "terminal.local",
          input: { cols: 120, rows: 30 }
        },
        restorePolicy: "recreate"
      }
    ]
  });

  if (!parsed.tabs[0] || !("tabKind" in parsed.tabs[0])) return;
  if (parsed.tabs[0].tabKind !== "terminal.local") return;
  assert.equal(parsed.tabs[0].widget?.kind, "terminal.local");
});

test("workspace snapshot schema accepts valid v3 widget payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 3,
      id: "v3",
      name: "v3",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      }
    },
    tabs: [
      {
        id: "tab-1",
        title: "Files",
        widget: {
          kind: "file.browser",
          input: {
            pluginId: "builtin.workspace",
            viewId: "file.browser",
            state: {}
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  assert.equal(parsed.layout.schemaVersion, 3);
  if (!parsed.tabs[0] || !("widget" in parsed.tabs[0])) return;
  assert.equal(parsed.tabs[0].widget.kind, "file.browser");
});

test("workspace snapshot schema accepts plugin.widget payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 3,
      id: "plugin-widget",
      name: "plugin-widget",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      }
    },
    tabs: [
      {
        id: "tab-1",
        title: "Todo",
        widget: {
          kind: "plugin.widget",
          input: {
            pluginId: "external.todo",
            widgetId: "todo.board",
            state: {}
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  if (!parsed.tabs[0] || !("widget" in parsed.tabs[0])) return;
  assert.equal(parsed.tabs[0].widget.kind, "plugin.widget");
});

test("normalizeWorkspaceSnapshot upgrades v3 legacy plugin.view to widget semantics", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 3,
      id: "legacy-v3-plugin-view",
      name: "legacy-v3-plugin-view",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      }
    },
    tabs: [
      {
        id: "tab-1",
        title: "Markdown",
        widget: {
          kind: "plugin.view",
          input: {
            pluginId: "builtin.workspace",
            viewId: "widget.markdown",
            state: {}
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  const normalized = normalizeWorkspaceSnapshot(parsed);
  if (!normalized.tabs[0]) return;
  assert.equal(normalized.tabs[0].widget.kind, "note.markdown");
  assert.deepEqual(normalized.tabs[0].widget.input, {
    extensionId: "builtin.workspace",
    pluginId: "builtin.workspace",
    widgetId: "note.markdown",
    state: {}
  });
});

test("workspace snapshot schema rejects split sizes that do not sum to 1", () => {
  assert.throws(
    () =>
      workspaceSnapshotSchema.parse({
        layout: {
          schemaVersion: 2,
          id: "bad-layout",
          name: "bad-layout",
          activePaneId: "pane-1",
          createdAt: 1,
          updatedAt: 1,
          root: {
            id: "split-1",
            type: "split",
            direction: "horizontal",
            sizes: [0.9, 0.9],
            children: [
              {
                id: "pane-1",
                type: "leaf",
                tabIds: []
              },
              {
                id: "pane-2",
                type: "leaf",
                tabIds: []
              }
            ]
          }
        },
        tabs: []
      }),
    /sizes must sum to 1/
  );
});

test("workspace snapshot schema rejects mismatched widget kind and tabKind", () => {
  assert.throws(
    () =>
      workspaceSnapshotSchema.parse({
        layout: {
          schemaVersion: 2,
          id: "bad-widget-kind",
          name: "bad-widget-kind",
          activePaneId: "pane-1",
          createdAt: 1,
          updatedAt: 1,
          root: {
            id: "pane-1",
            type: "leaf",
            tabIds: ["tab-1"],
            activeTabId: "tab-1"
          }
        },
        tabs: [
          {
            id: "tab-1",
            tabKind: "terminal.local",
            title: "Local 1",
            input: { cols: 120, rows: 30 },
            widget: {
              kind: "plugin.view",
              input: {
                pluginId: "builtin.workspace",
                viewId: "widget.markdown",
                state: {}
              }
            },
            restorePolicy: "recreate"
          }
        ]
      }),
    /Invalid literal value/
  );
});

test("workspace snapshot schema fills default plugin.view state when omitted", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 2,
      id: "plugin-default-state",
      name: "plugin-default-state",
      activePaneId: "pane-1",
      createdAt: 1,
      updatedAt: 1,
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-1"],
        activeTabId: "tab-1"
      }
    },
    tabs: [
      {
        id: "tab-1",
        tabKind: "plugin.view",
        title: "Markdown",
        input: {
          pluginId: "builtin.workspace",
          viewId: "widget.markdown"
        },
        restorePolicy: "manual"
      }
    ]
  });

  if (!parsed.tabs[0] || !("tabKind" in parsed.tabs[0])) return;
  if (parsed.tabs[0].tabKind !== "plugin.view") return;
  assert.deepEqual(parsed.tabs[0].input.state, {});
});

test("plugin rpc response requires error when ok=false", () => {
  assert.throws(
    () =>
      pluginRpcResponseSchema.parse({
        requestId: "req-1",
        ok: false
      }),
    /error is required/
  );
});

test("plugin manifest migrates v1 tabKinds to v2 widgetKinds", () => {
  const parsed = pluginManifestSchema.parse({
    id: "plugin.compat",
    version: "0.1.0",
    entry: "renderer://compat",
    contributes: {
      tabKinds: ["plugin.view:file.browser"],
      commands: [],
      widgets: ["file.browser"]
    }
  });

  assert.equal(parsed.manifestVersion, 2);
  assert.deepEqual(parsed.contributes.widgetKinds, ["plugin.view:file.browser"]);
});

test("plugin manifest keeps explicit v2 widgetKinds", () => {
  const parsed = pluginManifestSchema.parse({
    manifestVersion: 2,
    id: "plugin.explicit",
    version: "0.1.0",
    entry: "renderer://explicit",
    contributes: {
      widgetKinds: ["plugin.view:widget.markdown"],
      commands: [],
      widgets: ["widget.markdown"]
    }
  });

  assert.equal(parsed.manifestVersion, 2);
  assert.deepEqual(parsed.contributes.widgetKinds, ["plugin.view:widget.markdown"]);
});
