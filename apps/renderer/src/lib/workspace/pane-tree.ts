import type {
  LeafPaneNode,
  PaneDirection,
  PaneNode,
  WorkspaceLayout
} from "@localterm/shared";

type SplitPaneOptions = {
  splitId?: string;
  newPaneId?: string;
  sizes?: [number, number];
  placeNewPaneFirst?: boolean;
};

type UpdateLeafResult = {
  node: PaneNode;
  updated: boolean;
};

function randomId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

function isLeaf(node: PaneNode): node is LeafPaneNode {
  return node.type === "leaf";
}

function collectTabIds(node: PaneNode): string[] {
  if (isLeaf(node)) return node.tabIds;
  return [...collectTabIds(node.children[0]), ...collectTabIds(node.children[1])];
}

function appendTabsToFirstLeaf(node: PaneNode, tabIds: string[]): PaneNode {
  if (tabIds.length === 0) return node;
  if (isLeaf(node)) {
    const merged = [...node.tabIds, ...tabIds];
    return {
      ...node,
      tabIds: merged,
      activeTabId: node.activeTabId ?? tabIds[0]
    };
  }
  return {
    ...node,
    children: [appendTabsToFirstLeaf(node.children[0], tabIds), node.children[1]]
  };
}

type CloseWalkResult = {
  node: PaneNode;
  removed: boolean;
};

function closePaneWalk(node: PaneNode, paneId: string): CloseWalkResult {
  if (isLeaf(node)) {
    return { node, removed: false };
  }

  const [left, right] = node.children;
  if (left.id === paneId) {
    return {
      node: appendTabsToFirstLeaf(right, collectTabIds(left)),
      removed: true
    };
  }
  if (right.id === paneId) {
    return {
      node: appendTabsToFirstLeaf(left, collectTabIds(right)),
      removed: true
    };
  }

  const leftResult = closePaneWalk(left, paneId);
  if (leftResult.removed) {
    return {
      removed: true,
      node: {
        ...node,
        children: [leftResult.node, right]
      }
    };
  }

  const rightResult = closePaneWalk(right, paneId);
  if (rightResult.removed) {
    return {
      removed: true,
      node: {
        ...node,
        children: [left, rightResult.node]
      }
    };
  }

  return { node, removed: false };
}

export function createDefaultWorkspaceLayout(now = Date.now()): WorkspaceLayout {
  return {
    schemaVersion: 2,
    id: "default",
    name: "Default Workspace",
    activePaneId: "pane-1",
    createdAt: now,
    updatedAt: now,
    root: {
      id: "pane-1",
      type: "leaf",
      tabIds: []
    },
    overlays: {
      floatingPanels: [],
      commandRadial: {
        enabled: false,
        hotkey: "Ctrl+K"
      }
    }
  };
}

export function splitPaneNode(
  root: PaneNode,
  paneId: string,
  direction: PaneDirection,
  options: SplitPaneOptions = {}
): PaneNode {
  let found = false;
  const splitId = options.splitId ?? randomId("split");
  const newPaneId = options.newPaneId ?? randomId("pane");
  const sizes = options.sizes ?? [0.5, 0.5];
  const placeNewPaneFirst = options.placeNewPaneFirst ?? false;

  const walk = (node: PaneNode): PaneNode => {
    if (isLeaf(node) && node.id === paneId) {
      found = true;
      return {
        id: splitId,
        type: "split",
        direction,
        sizes,
        children: placeNewPaneFirst
          ? [
              {
                id: newPaneId,
                type: "leaf",
                tabIds: []
              },
              node
            ]
          : [
              node,
              {
                id: newPaneId,
                type: "leaf",
                tabIds: []
              }
            ]
      };
    }

    if (!isLeaf(node)) {
      return {
        ...node,
        children: [walk(node.children[0]), walk(node.children[1])]
      };
    }

    return node;
  };

  const next = walk(root);
  if (!found) throw new Error(`pane not found: ${paneId}`);
  return next;
}

export function closePaneNode(root: PaneNode, paneId: string): PaneNode {
  if (isLeaf(root)) {
    throw new Error("cannot close the last pane");
  }
  const result = closePaneWalk(root, paneId);
  if (!result.removed) throw new Error(`pane not found or not closable: ${paneId}`);
  return result.node;
}

export function moveTabAcrossPanes(root: PaneNode, tabId: string, targetPaneId: string): PaneNode {
  let tabFound = false;
  let targetFound = false;

  const removeTab = (node: PaneNode): PaneNode => {
    if (isLeaf(node)) {
      if (!node.tabIds.includes(tabId)) return node;
      tabFound = true;
      const nextTabIds = node.tabIds.filter((id) => id !== tabId);
      return {
        ...node,
        tabIds: nextTabIds,
        activeTabId: node.activeTabId === tabId ? nextTabIds[0] : node.activeTabId
      };
    }
    return {
      ...node,
      children: [removeTab(node.children[0]), removeTab(node.children[1])]
    };
  };

  const insertTab = (node: PaneNode): PaneNode => {
    if (isLeaf(node)) {
      if (node.id !== targetPaneId) return node;
      targetFound = true;
      if (node.tabIds.includes(tabId)) return node;
      const nextTabIds = [...node.tabIds, tabId];
      return {
        ...node,
        tabIds: nextTabIds,
        activeTabId: node.activeTabId ?? tabId
      };
    }
    return {
      ...node,
      children: [insertTab(node.children[0]), insertTab(node.children[1])]
    };
  };

  const withoutTab = removeTab(root);
  if (!tabFound) throw new Error(`tab not found: ${tabId}`);
  const withTab = insertTab(withoutTab);
  if (!targetFound) throw new Error(`target pane not found: ${targetPaneId}`);
  return withTab;
}

export function listLeafPaneIds(root: PaneNode): string[] {
  if (isLeaf(root)) return [root.id];
  return [...listLeafPaneIds(root.children[0]), ...listLeafPaneIds(root.children[1])];
}

export function getLeafPaneById(root: PaneNode, paneId: string): LeafPaneNode | null {
  if (isLeaf(root)) return root.id === paneId ? root : null;
  return getLeafPaneById(root.children[0], paneId) ?? getLeafPaneById(root.children[1], paneId);
}

export function findPaneIdByTabId(root: PaneNode, tabId: string): string | null {
  if (isLeaf(root)) {
    return root.tabIds.includes(tabId) ? root.id : null;
  }
  return findPaneIdByTabId(root.children[0], tabId) ?? findPaneIdByTabId(root.children[1], tabId);
}

function updateLeafNode(
  root: PaneNode,
  paneId: string,
  updater: (leaf: LeafPaneNode) => LeafPaneNode
): UpdateLeafResult {
  if (isLeaf(root)) {
    if (root.id !== paneId) {
      return { node: root, updated: false };
    }
    return {
      node: updater(root),
      updated: true
    };
  }

  const left = updateLeafNode(root.children[0], paneId, updater);
  if (left.updated) {
    return {
      updated: true,
      node: {
        ...root,
        children: [left.node, root.children[1]]
      }
    };
  }

  const right = updateLeafNode(root.children[1], paneId, updater);
  if (right.updated) {
    return {
      updated: true,
      node: {
        ...root,
        children: [root.children[0], right.node]
      }
    };
  }

  return { node: root, updated: false };
}

export function addTabToPane(root: PaneNode, paneId: string, tabId: string): PaneNode {
  const next = updateLeafNode(root, paneId, (leaf) => {
    if (leaf.tabIds.includes(tabId)) return leaf;
    const tabIds = [...leaf.tabIds, tabId];
    return {
      ...leaf,
      tabIds,
      activeTabId: tabId
    };
  });
  if (!next.updated) {
    throw new Error(`pane not found: ${paneId}`);
  }
  return next.node;
}

export function activateTabInPane(root: PaneNode, paneId: string, tabId: string): PaneNode {
  const next = updateLeafNode(root, paneId, (leaf) => {
    if (!leaf.tabIds.includes(tabId)) return leaf;
    return {
      ...leaf,
      activeTabId: tabId
    };
  });
  if (!next.updated) {
    throw new Error(`pane not found: ${paneId}`);
  }
  return next.node;
}

export function removeTabFromPane(root: PaneNode, tabId: string): PaneNode {
  const paneId = findPaneIdByTabId(root, tabId);
  if (!paneId) return root;
  const next = updateLeafNode(root, paneId, (leaf) => {
    const tabIds = leaf.tabIds.filter((id) => id !== tabId);
    return {
      ...leaf,
      tabIds,
      activeTabId: leaf.activeTabId === tabId ? tabIds[0] : leaf.activeTabId
    };
  });
  return next.node;
}
