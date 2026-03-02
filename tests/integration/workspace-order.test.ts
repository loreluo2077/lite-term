import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { WorkspaceSnapshot } from "@localterm/shared";
import {
  listWorkspaces,
  saveWorkspaceSnapshot
} from "../../apps/desktop/src/lib/workspace-storage";

function makeSnapshot(id: string, name: string): WorkspaceSnapshot {
  return {
    layout: {
      schemaVersion: 2,
      id,
      name,
      activePaneId: "pane-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      root: {
        id: "pane-1",
        type: "leaf",
        tabIds: [],
        activeTabId: undefined
      },
      overlays: {
        floatingPanels: [],
        commandRadial: {
          enabled: false,
          hotkey: "Ctrl+K"
        }
      }
    },
    tabs: []
  };
}

test("workspace order preserved on save", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-order-"));
  try {
    // Create workspaces in specific order
    const ws1 = makeSnapshot("ws-1", "Workspace 1");
    const ws2 = makeSnapshot("ws-2", "Workspace 2");
    const ws3 = makeSnapshot("ws-3", "Workspace 3");

    await saveWorkspaceSnapshot(tempRoot, ws1);
    await saveWorkspaceSnapshot(tempRoot, ws2);
    await saveWorkspaceSnapshot(tempRoot, ws3);

    const initialList = await listWorkspaces(tempRoot);
    assert.equal(initialList.workspaces.length, 3);
    assert.equal(initialList.workspaces[0].id, "ws-1");
    assert.equal(initialList.workspaces[1].id, "ws-2");
    assert.equal(initialList.workspaces[2].id, "ws-3");

    // Simulate switching to ws-2 (re-save it)
    await saveWorkspaceSnapshot(tempRoot, ws2);

    const afterSwitch = await listWorkspaces(tempRoot);
    assert.equal(afterSwitch.workspaces.length, 3);
    // Order should NOT change
    assert.equal(afterSwitch.workspaces[0].id, "ws-1", "ws-1 should stay first");
    assert.equal(afterSwitch.workspaces[1].id, "ws-2", "ws-2 should stay second");
    assert.equal(afterSwitch.workspaces[2].id, "ws-3", "ws-3 should stay third");

    // Switch to ws-1
    await saveWorkspaceSnapshot(tempRoot, ws1);

    const afterSwitch2 = await listWorkspaces(tempRoot);
    assert.equal(afterSwitch2.workspaces.length, 3);
    // Order should still be preserved
    assert.equal(afterSwitch2.workspaces[0].id, "ws-1");
    assert.equal(afterSwitch2.workspaces[1].id, "ws-2");
    assert.equal(afterSwitch2.workspaces[2].id, "ws-3");

    // Verify lastAccessed was updated
    const ws1Entry = afterSwitch2.workspaces.find((w) => w.id === "ws-1");
    const ws2Entry = afterSwitch2.workspaces.find((w) => w.id === "ws-2");
    assert.ok(ws1Entry);
    assert.ok(ws2Entry);
    assert.ok(
      ws1Entry.lastAccessed > ws2Entry.lastAccessed,
      "ws-1 should have newer lastAccessed"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("new workspace appended to end", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-append-"));
  try {
    const ws1 = makeSnapshot("ws-1", "First");
    const ws2 = makeSnapshot("ws-2", "Second");

    await saveWorkspaceSnapshot(tempRoot, ws1);
    await saveWorkspaceSnapshot(tempRoot, ws2);

    const initial = await listWorkspaces(tempRoot);
    assert.equal(initial.workspaces[0].id, "ws-1");
    assert.equal(initial.workspaces[1].id, "ws-2");

    // Add new workspace
    const ws3 = makeSnapshot("ws-3", "Third");
    await saveWorkspaceSnapshot(tempRoot, ws3);

    const afterAdd = await listWorkspaces(tempRoot);
    assert.equal(afterAdd.workspaces.length, 3);
    // New workspace should be at the end
    assert.equal(afterAdd.workspaces[0].id, "ws-1");
    assert.equal(afterAdd.workspaces[1].id, "ws-2");
    assert.equal(afterAdd.workspaces[2].id, "ws-3", "new workspace should be appended");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
