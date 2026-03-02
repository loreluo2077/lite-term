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
