import test from "node:test";
import assert from "node:assert/strict";
import type { PaneNode } from "@localterm/shared";
import {
  closePaneNode,
  listLeafPaneIds,
  moveTabAcrossPanes,
  splitPaneNode
} from "../../apps/renderer/src/lib/workspace/pane-tree";

test("splitPaneNode turns target leaf into split node", () => {
  const root: PaneNode = {
    id: "pane-1",
    type: "leaf",
    tabIds: ["tab-1"],
    activeTabId: "tab-1"
  };

  const next = splitPaneNode(root, "pane-1", "horizontal", {
    splitId: "split-1",
    newPaneId: "pane-2",
    sizes: [0.6, 0.4]
  });

  assert.equal(next.type, "split");
  assert.equal(next.id, "split-1");
  assert.deepEqual(next.children[0].id, "pane-1");
  assert.deepEqual(next.children[1].id, "pane-2");
});

test("closePaneNode promotes sibling and migrates tabs", () => {
  const root: PaneNode = {
    id: "split-1",
    type: "split",
    direction: "vertical",
    sizes: [0.5, 0.5],
    children: [
      {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-a"],
        activeTabId: "tab-a"
      },
      {
        id: "pane-2",
        type: "leaf",
        tabIds: ["tab-b"],
        activeTabId: "tab-b"
      }
    ]
  };

  const next = closePaneNode(root, "pane-1");
  assert.equal(next.type, "leaf");
  assert.deepEqual(next.tabIds, ["tab-b", "tab-a"]);
});

test("moveTabAcrossPanes moves tab from source leaf to target leaf", () => {
  const root: PaneNode = {
    id: "split-1",
    type: "split",
    direction: "horizontal",
    sizes: [0.5, 0.5],
    children: [
      {
        id: "pane-1",
        type: "leaf",
        tabIds: ["tab-a", "tab-b"],
        activeTabId: "tab-a"
      },
      {
        id: "pane-2",
        type: "leaf",
        tabIds: []
      }
    ]
  };

  const next = moveTabAcrossPanes(root, "tab-a", "pane-2");
  const leafIds = listLeafPaneIds(next);
  assert.deepEqual(leafIds, ["pane-1", "pane-2"]);

  if (next.type !== "split") {
    throw new Error("expected split root");
  }
  const source = next.children[0];
  const target = next.children[1];
  if (source.type !== "leaf" || target.type !== "leaf") {
    throw new Error("expected leaf children");
  }
  assert.deepEqual(source.tabIds, ["tab-b"]);
  assert.deepEqual(target.tabIds, ["tab-a"]);
  assert.equal(target.activeTabId, "tab-a");
});
