import { atom } from "jotai";
import type {
  PaneDirection,
  PaneNode,
  TabDescriptor,
  WorkspaceLayout
} from "@localterm/shared";
import {
  activateTabInPane,
  addTabToPane,
  closePaneNode,
  createDefaultWorkspaceLayout,
  getLeafPaneById,
  listLeafPaneIds,
  moveTabAcrossPanes,
  removeTabFromPane,
  splitPaneNode
} from "../workspace/pane-tree";

export type TabRuntimeState = {
  tabId: string;
  lifecycle: "starting" | "ready" | "exited" | "error";
  wsConnected: boolean;
  pid?: number;
  port?: number;
  errorMessage?: string;
};

export const currentWorkspaceAtom = atom<WorkspaceLayout>(createDefaultWorkspaceLayout());
export const tabDescriptorsAtom = atom<Record<string, TabDescriptor>>({});
export const tabRuntimeStateAtom = atom<Record<string, TabRuntimeState>>({});

export const splitPaneAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      paneId: string;
      direction: PaneDirection;
      splitId?: string;
      newPaneId?: string;
      sizes?: [number, number];
      placeNewPaneFirst?: boolean;
    }
  ) => {
    const current = get(currentWorkspaceAtom);
    const splitOptions: {
      splitId?: string;
      newPaneId?: string;
      sizes?: [number, number];
      placeNewPaneFirst?: boolean;
    } = {};
    if (payload.splitId) splitOptions.splitId = payload.splitId;
    if (payload.newPaneId) splitOptions.newPaneId = payload.newPaneId;
    if (payload.sizes) splitOptions.sizes = payload.sizes;
    if (payload.placeNewPaneFirst !== undefined) {
      splitOptions.placeNewPaneFirst = payload.placeNewPaneFirst;
    }
    const root = splitPaneNode(current.root, payload.paneId, payload.direction, splitOptions);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      updatedAt: Date.now()
    });
    return {
      splitId: payload.splitId,
      newPaneId: payload.newPaneId
    };
  }
);

export const closePaneAtom = atom(
  null,
  (get, set, payload: { paneId: string }) => {
    const current = get(currentWorkspaceAtom);
    const root = closePaneNode(current.root, payload.paneId);
    const leafPaneIds = listLeafPaneIds(root);
    const activePaneId = leafPaneIds.includes(current.activePaneId)
      ? current.activePaneId
      : (leafPaneIds[0] ?? current.activePaneId);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      activePaneId,
      updatedAt: Date.now()
    });
  }
);

export const moveTabAtom = atom(
  null,
  (get, set, payload: { tabId: string; targetPaneId: string }) => {
    const current = get(currentWorkspaceAtom);
    const root = moveTabAcrossPanes(current.root, payload.tabId, payload.targetPaneId);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      updatedAt: Date.now()
    });
  }
);

export const setActivePaneAtom = atom(
  null,
  (get, set, payload: { paneId: string }) => {
    const current = get(currentWorkspaceAtom);
    if (!getLeafPaneById(current.root, payload.paneId)) {
      return;
    }
    set(currentWorkspaceAtom, {
      ...current,
      activePaneId: payload.paneId,
      updatedAt: Date.now()
    });
  }
);

export const addTabToPaneAtom = atom(
  null,
  (get, set, payload: { paneId: string; tabId: string }) => {
    const current = get(currentWorkspaceAtom);
    const root = addTabToPane(current.root, payload.paneId, payload.tabId);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      activePaneId: payload.paneId,
      updatedAt: Date.now()
    });
  }
);

export const removeTabFromPaneAtom = atom(
  null,
  (get, set, payload: { tabId: string }) => {
    const current = get(currentWorkspaceAtom);
    const root = removeTabFromPane(current.root, payload.tabId);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      updatedAt: Date.now()
    });
  }
);

export const activateTabInPaneAtom = atom(
  null,
  (get, set, payload: { paneId: string; tabId: string }) => {
    const current = get(currentWorkspaceAtom);
    const root = activateTabInPane(current.root, payload.paneId, payload.tabId);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      activePaneId: payload.paneId,
      updatedAt: Date.now()
    });
  }
);

// Atom to update panel sizes when user resizes them
export const updatePanelSizesAtom = atom(
  null,
  (get, set, payload: { paneId: string; sizes: [number, number] }) => {
    const current = get(currentWorkspaceAtom);

    const updateSizes = (node: PaneNode): PaneNode => {
      if (node.type === "split") {
        if (node.id === payload.paneId) {
          return {
            ...node,
            sizes: payload.sizes
          };
        }
        return {
          ...node,
          children: [updateSizes(node.children[0]), updateSizes(node.children[1])]
        };
      }
      return node;
    };

    const root = updateSizes(current.root);
    set(currentWorkspaceAtom, {
      ...current,
      root,
      updatedAt: Date.now()
    });
  }
);
