import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { WorkspaceSnapshot } from "@localterm/shared";
import {
  closeWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  getDefaultWorkspaceSnapshot,
  listWorkspaces,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot
} from "../../apps/desktop/src/lib/workspace-storage";

function makeSnapshot(id: string, tabId: string): WorkspaceSnapshot {
  return {
    layout: {
      schemaVersion: 3,
      id,
      name: `Workspace ${id}`,
      activePaneId: "pane-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: [tabId],
        activeTabId: tabId
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
        id: tabId,
        title: "Local 1",
        widget: {
          kind: "extension.widget",
          input: {
            extensionId: "builtin.workspace",
            widgetId: "terminal.local",
            state: {
              cols: 120,
              rows: 30
            }
          }
        },
        restorePolicy: "manual"
      }
    ]
  };
}

function makeExtensionWidgetSnapshot(id: string, tabId: string): WorkspaceSnapshot {
  return {
    layout: {
      schemaVersion: 3,
      id,
      name: `Workspace ${id}`,
      activePaneId: "pane-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: [tabId],
        activeTabId: tabId
      }
    },
    tabs: [
      {
        id: tabId,
        title: "Markdown",
        widget: {
          kind: "extension.widget",
          input: {
            extensionId: "builtin.workspace",
            widgetId: "widget.markdown",
            state: {
              source: "inline",
              content: "# persisted"
            }
          }
        },
        restorePolicy: "manual"
      }
    ]
  };
}

test("workspace storage: save/load/list/delete/default", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-workspace-"));
  try {
    const first = makeSnapshot("default", "tab-1");
    const second = makeSnapshot("dev", "tab-2");

    await saveWorkspaceSnapshot(tempRoot, first);
    await saveWorkspaceSnapshot(tempRoot, second);

    const listed = await listWorkspaces(tempRoot);
    assert.equal(listed.workspaces.length, 2);
    // With default workspace functionality removed, the last saved workspace becomes the de facto default
    assert.equal(listed.workspaces.some(w => w.id === "dev"), true);

    const loaded = await loadWorkspaceSnapshot(tempRoot, "dev");
    assert.equal(loaded.layout.id, "dev");
    assert.equal(loaded.layout.schemaVersion, 3);
    assert.equal(loaded.tabs[0].id, "tab-2");

    await closeWorkspaceSnapshot(tempRoot, "dev");
    const listedAfterClose = await listWorkspaces(tempRoot);
    const closedDev = listedAfterClose.workspaces.find((w) => w.id === "dev");
    assert.equal(closedDev?.isClosed, true);

    const defaultWorkspace = await getDefaultWorkspaceSnapshot(tempRoot);
    assert.ok(defaultWorkspace.workspace);
    assert.equal(defaultWorkspace.workspace?.layout.id, "default");

    await loadWorkspaceSnapshot(tempRoot, "dev");
    const listedAfterReopen = await listWorkspaces(tempRoot);
    const reopenedDev = listedAfterReopen.workspaces.find((w) => w.id === "dev");
    assert.equal(reopenedDev?.isClosed, false);

    await deleteWorkspaceSnapshot(tempRoot, "default");
    const listedAfterDelete = await listWorkspaces(tempRoot);
    assert.equal(listedAfterDelete.workspaces.length, 1);
    assert.equal(listedAfterDelete.workspaces[0]?.id, "dev");

    const extensionWorkspace = makeExtensionWidgetSnapshot("study", "tab-plugin");
    await saveWorkspaceSnapshot(tempRoot, extensionWorkspace);
    const loadedExtension = await loadWorkspaceSnapshot(tempRoot, "study");
    assert.equal(loadedExtension.layout.schemaVersion, 3);
    assert.equal(loadedExtension.tabs[0]?.widget.kind, "note.markdown");
    assert.deepEqual(loadedExtension.tabs[0]?.widget.input, {
      extensionId: "builtin.workspace",
      widgetId: "note.markdown",
      state: {
        source: "inline",
        content: "# persisted"
      }
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("workspace storage: getDefault returns null when there is no open workspace", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-workspace-empty-"));
  try {
    const defaultWorkspace = await getDefaultWorkspaceSnapshot(tempRoot);
    assert.equal(defaultWorkspace.workspace, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("workspace storage: getDefault skips broken snapshot and returns next open workspace", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-workspace-broken-"));
  try {
    const first = makeSnapshot("ws-first", "tab-1");
    const second = makeSnapshot("ws-second", "tab-2");
    await saveWorkspaceSnapshot(tempRoot, first);
    await saveWorkspaceSnapshot(tempRoot, second);

    const brokenSnapshotPath = path.join(
      tempRoot,
      "workspace-store",
      "workspaces",
      "ws-first.json"
    );
    await fs.rm(brokenSnapshotPath, { force: true });

    const defaultWorkspace = await getDefaultWorkspaceSnapshot(tempRoot);
    assert.ok(defaultWorkspace.workspace);
    assert.equal(defaultWorkspace.workspace?.layout.id, "ws-second");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("workspace storage: migrates legacy terminal.local payload to extension terminal", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-workspace-legacy-terminal-"));
  try {
    const legacySnapshot = {
      layout: {
        schemaVersion: 3,
        id: "legacy-terminal",
        name: "legacy-terminal",
        activePaneId: "pane-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        root: {
          id: "pane-1",
          type: "leaf",
          tabIds: ["tab-legacy"],
          activeTabId: "tab-legacy"
        }
      },
      tabs: [
        {
          id: "tab-legacy",
          title: "Legacy Terminal",
          widget: {
            kind: "terminal.local",
            input: {
              cols: 140,
              rows: 40,
              startupScripts: [
                {
                  id: "s1",
                  command: "echo hello",
                  delayMs: 50,
                  enabled: true
                }
              ]
            }
          },
          restorePolicy: "recreate"
        }
      ]
    };

    await saveWorkspaceSnapshot(tempRoot, legacySnapshot);
    const loaded = await loadWorkspaceSnapshot(tempRoot, "legacy-terminal");
    assert.equal(loaded.tabs[0]?.widget.kind, "extension.widget");
    assert.deepEqual(loaded.tabs[0]?.widget.input, {
      extensionId: "builtin.workspace",
      widgetId: "terminal.local",
      state: {
        cols: 140,
        rows: 40,
        startupScripts: [
          {
            id: "s1",
            command: "echo hello",
            delayMs: 50,
            enabled: true
          }
        ],
        sessionId: "",
        port: 0,
        pid: 0,
        status: "idle",
        wsConnected: false
      }
    });
    assert.equal(loaded.tabs[0]?.restorePolicy, "manual");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("workspace storage: rejects unsafe workspace id path traversal", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-workspace-unsafe-"));
  try {
    const unsafeSnapshot = makeSnapshot("../unsafe", "tab-unsafe");
    await assert.rejects(
      () => saveWorkspaceSnapshot(tempRoot, unsafeSnapshot),
      /invalid workspace id/
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
