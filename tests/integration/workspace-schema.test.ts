import test from "node:test";
import assert from "node:assert/strict";
import {
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

  assert.equal(parsed.tabs[0]?.tabKind, "plugin.view");
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

  assert.equal(parsed.tabs[0]?.tabKind, "terminal.local");
  if (parsed.tabs[0]?.tabKind !== "terminal.local") return;
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

  if (parsed.tabs[0]?.tabKind !== "terminal.local") return;
  assert.equal(parsed.tabs[0].widget?.kind, "terminal.local");
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

  if (parsed.tabs[0]?.tabKind !== "plugin.view") return;
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
