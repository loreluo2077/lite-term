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
      schemaVersion: 2,
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
        tabKind: "terminal.local",
        title: "Local 1",
        input: { cols: 120, rows: 30 },
        restorePolicy: "recreate"
      }
    ]
  };
}

function makePluginSnapshot(id: string, tabId: string): WorkspaceSnapshot {
  return {
    layout: {
      schemaVersion: 2,
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
        tabKind: "plugin.view",
        title: "Markdown",
        input: {
          pluginId: "builtin.workspace",
          viewId: "widget.markdown",
          state: {
            source: "inline",
            content: "# persisted"
          }
        },
        widget: {
          kind: "plugin.view",
          input: {
            pluginId: "builtin.workspace",
            viewId: "widget.markdown",
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

    const pluginWorkspace = makePluginSnapshot("study", "tab-plugin");
    await saveWorkspaceSnapshot(tempRoot, pluginWorkspace);
    const loadedPlugin = await loadWorkspaceSnapshot(tempRoot, "study");
    assert.equal(loadedPlugin.tabs[0]?.tabKind, "plugin.view");
    assert.deepEqual(loadedPlugin.tabs[0]?.input, pluginWorkspace.tabs[0]?.input);
    assert.deepEqual(loadedPlugin.tabs[0]?.widget, pluginWorkspace.tabs[0]?.widget);
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
