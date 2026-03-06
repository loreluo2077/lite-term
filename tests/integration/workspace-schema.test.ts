import test from "node:test";
import assert from "node:assert/strict";
import {
  extensionManifestSchema,
  extensionRpcResponseSchema,
  normalizeWorkspaceSnapshot,
  workspaceSnapshotSchema
} from "@localterm/shared";

test("workspace snapshot schema accepts valid v3 extension terminal payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 3,
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
        title: "Local 1",
        widget: {
          kind: "extension.widget",
          input: {
            extensionId: "builtin.workspace",
            widgetId: "terminal.local",
            state: { cols: 120, rows: 30 }
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  assert.equal(parsed.layout.schemaVersion, 3);
  assert.equal(parsed.tabs.length, 1);
  assert.equal(parsed.tabs[0]?.widget.kind, "extension.widget");
});

test("workspace snapshot schema accepts builtin file widget payload", () => {
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
            extensionId: "builtin.workspace",
            widgetId: "file.browser",
            state: {}
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  assert.equal(parsed.tabs[0]?.widget.kind, "file.browser");
});

test("workspace snapshot schema rejects legacy terminal.local descriptor", () => {
  assert.throws(
    () =>
      workspaceSnapshotSchema.parse({
        layout: {
          schemaVersion: 3,
          id: "legacy-terminal",
          name: "legacy-terminal",
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
            title: "Legacy Terminal",
            widget: {
              kind: "terminal.local",
              input: {
                cols: 120,
                rows: 30
              }
            },
            restorePolicy: "recreate"
          }
        ]
      })
  );
});

test("workspace snapshot schema accepts extension.widget payload", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 3,
      id: "extension-widget",
      name: "extension-widget",
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
          kind: "extension.widget",
          input: {
            extensionId: "external.todo",
            widgetId: "todo.board",
            state: {}
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  assert.equal(parsed.tabs[0]?.widget.kind, "extension.widget");
});

test("normalizeWorkspaceSnapshot normalizes builtin markdown id", () => {
  const parsed = workspaceSnapshotSchema.parse({
    layout: {
      schemaVersion: 3,
      id: "normalize-markdown",
      name: "normalize-markdown",
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
          kind: "extension.widget",
          input: {
            extensionId: "builtin.workspace",
            widgetId: "widget.markdown",
            state: {}
          }
        },
        restorePolicy: "manual"
      }
    ]
  });

  const normalized = normalizeWorkspaceSnapshot(parsed);
  assert.equal(normalized.tabs[0]?.widget.kind, "note.markdown");
  assert.deepEqual(normalized.tabs[0]?.widget.input, {
    extensionId: "builtin.workspace",
    widgetId: "note.markdown",
    state: {}
  });
});

test("workspace snapshot schema rejects legacy v2 payload", () => {
  assert.throws(
    () =>
      workspaceSnapshotSchema.parse({
        layout: {
          schemaVersion: 2,
          id: "legacy",
          name: "legacy",
          activePaneId: "pane-1",
          createdAt: 1,
          updatedAt: 1,
          root: {
            id: "pane-1",
            type: "leaf",
            tabIds: [],
            activeTabId: ""
          }
        },
        tabs: []
      }),
    /Invalid literal value/
  );
});

test("workspace snapshot schema rejects split sizes that do not sum to 1", () => {
  assert.throws(
    () =>
      workspaceSnapshotSchema.parse({
        layout: {
          schemaVersion: 3,
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

test("workspace snapshot schema rejects extension.widget without extensionId", () => {
  assert.throws(
    () =>
      workspaceSnapshotSchema.parse({
        layout: {
          schemaVersion: 3,
          id: "bad-widget",
          name: "bad-widget",
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
            title: "Broken",
            widget: {
              kind: "extension.widget",
              input: {
                widgetId: "todo.board",
                state: {}
              }
            },
            restorePolicy: "manual"
          }
        ]
      }),
    /extensionId/
  );
});

test("extension rpc response requires error when ok=false", () => {
  assert.throws(
    () =>
      extensionRpcResponseSchema.parse({
        requestId: "req-1",
        ok: false
      }),
    /error is required/
  );
});

test("extension manifest requires v2", () => {
  assert.throws(
    () =>
      extensionManifestSchema.parse({
        id: "extension.compat",
        version: "0.1.0",
        entry: "renderer://compat",
        contributes: {
          widgetKinds: ["extension.widget:file.browser"],
          commands: [],
          widgets: ["file.browser"]
        }
      }),
    /manifestVersion/
  );
});

test("extension manifest keeps explicit widgetKinds", () => {
  const parsed = extensionManifestSchema.parse({
    manifestVersion: 2,
    id: "extension.explicit",
    version: "0.1.0",
    entry: "renderer://explicit",
    contributes: {
      widgetKinds: ["extension.widget:note.markdown"],
      commands: [],
      widgets: ["note.markdown"]
    }
  });

  assert.equal(parsed.manifestVersion, 2);
  assert.deepEqual(parsed.contributes.widgetKinds, ["extension.widget:note.markdown"]);
});
