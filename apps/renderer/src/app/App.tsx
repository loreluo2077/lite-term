/**
 * Main application shell.
 * Phase 1 will keep this intentionally minimal: tabs + terminal panes only.
 */
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  activeTabIdAtom,
  tabsAtom,
  type TabRecord
} from "../lib/atoms/session";
import { PluginTabPane } from "../components/PluginTabPane";
import { TerminalPane } from "../components/TerminalPane";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTabDriver, type LocalTerminalDriverInput } from "../lib/tab-drivers";
import type {
  PaneDirection,
  PaneNode,
  TabKind,
  TabDescriptor,
  WorkspaceListResponse,
  WorkspaceSnapshot
} from "@localterm/shared";
import {
  activateTabInPaneAtom,
  addTabToPaneAtom,
  closePaneAtom,
  currentWorkspaceAtom,
  moveTabAtom,
  removeTabFromPaneAtom,
  setActivePaneAtom,
  splitPaneAtom,
  updatePanelSizesAtom
} from "../lib/atoms/workspace";
import {
  createDefaultWorkspaceLayout,
  getLeafPaneById,
  listLeafPaneIds
} from "../lib/workspace/pane-tree";
import {
  listPluginViewTemplates,
  parsePluginViewInput,
  makePluginViewInput,
  type OpenPluginViewRequest
} from "../lib/plugins";
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";

type TabPerfState = {
  bytesTotal: number;
  linesTotal: number;
  chunks: number;
  lastSampleBytes: number;
  lastSampleLines: number;
  rateBps: number;
  rateLps: number;
  updatedAt: number | null;
};

type PerfMemorySample = {
  sampledAt: number;
  rendererHeapUsedMb: number | null;
  rendererHeapTotalMb: number | null;
  mainRssMb: number;
  workersRssMb: number;
  activeWorkerCount: number;
};

type DropPreviewZone = "center" | "left" | "right" | "top" | "bottom";

type DropPreview = {
  paneId: string;
  zone: DropPreviewZone;
} | null;

type TabContextMenuState = {
  tabId: string;
  paneId: string;
  x: number;
  y: number;
} | null;

const BULK_STRESS_DEFAULTS = {
  sessions: 4,
  durationSec: 300,
  burstPerTick: 120,
  payloadSize: 140
} as const;

function nextTabTitle(count: number) {
  return `Local ${count}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRate(bytesPerSec: number) {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatLines(lines: number) {
  return lines.toLocaleString();
}

function initialTabPerfState(): TabPerfState {
  return {
    bytesTotal: 0,
    linesTotal: 0,
    chunks: 0,
    lastSampleBytes: 0,
    lastSampleLines: 0,
    rateBps: 0,
    rateLps: 0,
    updatedAt: null
  };
}

function buildStressCommand(durationSec: number, burstPerTick: number, payloadSize: number) {
  const durationMs = durationSec * 1000;
  // Use String.fromCharCode(34) instead of literal quotes to avoid escaping issues
  const js = [
    `const end=Date.now()+${durationMs};`,
    "let i=0;",
    `const payload=String.fromCharCode(120).repeat(${payloadSize});`, // 'x' = char 120
    "const NL=String.fromCharCode(10);",
    "const SP=String.fromCharCode(32);",
    "function tick(){",
    "  if(Date.now()>end){process.exit(0);return;}",
    `  for(let j=0;j<${burstPerTick};j++){process.stdout.write(Date.now()+SP+(i++)+SP+payload+NL);}`,
    "  setTimeout(tick,100);",
    "}",
    "tick();"
  ].join("");

  // PowerShell has input line length limits that can truncate long commands
  // Solution: Avoid quotes entirely by using String.fromCharCode() for all string literals
  const isWindows = navigator.platform.toLowerCase().includes("win");
  if (isWindows) {
    // PowerShell: Wrap in double quotes for safety (no internal quotes now)
    // Add explicit \r\n (CR+LF) for Windows line ending
    return `node -e "${js}"\r\n`;
  } else {
    // Unix: Use single quotes for safety
    return `node -e '${js}'\n`;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workspaceIdFromName(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `workspace-${Date.now().toString(36)}`;
}

function workspaceBadge(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "WS";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const left = parts[0]?.[0] ?? "W";
    const right = parts[1]?.[0] ?? "S";
    return `${left}${right}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function resolveDropZone(clientX: number, clientY: number, rect: DOMRect): DropPreviewZone {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  const edge = 0.22;
  if (relX < edge) return "left";
  if (relX > 1 - edge) return "right";
  if (relY < edge) return "top";
  if (relY > 1 - edge) return "bottom";
  return "center";
}

function dropPreviewOverlayClass(zone: DropPreviewZone) {
  if (zone === "center") {
    return "absolute inset-2 rounded-md border-2 border-dashed border-sky-400 bg-sky-400/10";
  }
  if (zone === "left") {
    return "absolute bottom-2 left-2 top-2 w-1/2 rounded-md border border-sky-400 bg-sky-400/10";
  }
  if (zone === "right") {
    return "absolute bottom-2 right-2 top-2 w-1/2 rounded-md border border-sky-400 bg-sky-400/10";
  }
  if (zone === "top") {
    return "absolute left-2 right-2 top-2 h-1/2 rounded-md border border-sky-400 bg-sky-400/10";
  }
  return "absolute bottom-2 left-2 right-2 h-1/2 rounded-md border border-sky-400 bg-sky-400/10";
}

const DEFAULT_LOCAL_TERMINAL_INPUT: LocalTerminalDriverInput = {
  cols: 120,
  rows: 30
};

const WORKSPACE_AUTOSAVE_DEBOUNCE_MS = 500;

function toPersistedTabDescriptors(records: TabRecord[]): TabDescriptor[] {
  return records.map((record) => {
    switch (record.tabKind) {
      case "terminal.local":
        return {
          id: record.id,
          tabKind: "terminal.local",
          title: record.title,
          input: (record.input as LocalTerminalDriverInput) ?? DEFAULT_LOCAL_TERMINAL_INPUT,
          restorePolicy: "recreate"
        };
      case "plugin.view":
        {
          const parsedInput = parsePluginViewInput(record.input) ?? {
            pluginId: "builtin.workspace",
            viewId: "widget.markdown",
            state: {
              content: "# Notes\n\n",
              source: "inline",
              mode: "edit"
            }
          };
          return {
            id: record.id,
            tabKind: "plugin.view",
            title: record.title,
            input: parsedInput,
            restorePolicy: "manual"
          };
        }
      case "terminal.ssh":
        return {
          id: record.id,
          tabKind: "terminal.ssh",
          title: record.title,
          input: record.input,
          restorePolicy: "manual"
        };
      case "web.page":
        return {
          id: record.id,
          tabKind: "web.page",
          title: record.title,
          input: record.input,
          restorePolicy: "manual"
        };
      case "web.browser":
        return {
          id: record.id,
          tabKind: "web.browser",
          title: record.title,
          input: record.input,
          restorePolicy: "manual"
        };
      case "widget.react":
        return {
          id: record.id,
          tabKind: "widget.react",
          title: record.title,
          input: record.input,
          restorePolicy: "manual"
        };
      default:
        return {
          id: record.id,
          tabKind: "widget.react",
          title: record.title,
          input: record.input,
          restorePolicy: "manual"
        };
    }
  });
}

function resolveInitialActiveTabId(root: PaneNode, activePaneId: string): string {
  const preferredPane = getLeafPaneById(root, activePaneId);
  if (preferredPane) {
    if (preferredPane.activeTabId && preferredPane.tabIds.includes(preferredPane.activeTabId)) {
      return preferredPane.activeTabId;
    }
    if (preferredPane.tabIds.length > 0) {
      return preferredPane.tabIds[0] ?? "";
    }
  }

  const firstPaneId = listLeafPaneIds(root)[0];
  if (!firstPaneId) return "";
  const firstPane = getLeafPaneById(root, firstPaneId);
  if (!firstPane) return "";
  if (firstPane.activeTabId && firstPane.tabIds.includes(firstPane.activeTabId)) {
    return firstPane.activeTabId;
  }
  return firstPane.tabIds[0] ?? "";
}

export function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom);
  const [workspace, setWorkspace] = useAtom(currentWorkspaceAtom);
  const [, splitPane] = useAtom(splitPaneAtom);
  const [, closePane] = useAtom(closePaneAtom);
  const [, setActivePane] = useAtom(setActivePaneAtom);
  const [, addTabToPane] = useAtom(addTabToPaneAtom);
  const [, removeTabFromPane] = useAtom(removeTabFromPaneAtom);
  const [, activateTabInPane] = useAtom(activateTabInPaneAtom);
  const [, moveTab] = useAtom(moveTabAtom);
  const [debugText, setDebugText] = useState("");
  const [perfRunning, setPerfRunning] = useState(false);
  const [perfStartedAt, setPerfStartedAt] = useState<number | null>(null);
  const [tabPerf, setTabPerf] = useState<Record<string, TabPerfState>>({});
  const [memorySample, setMemorySample] = useState<PerfMemorySample | null>(null);
  const [peakRendererHeapMb, setPeakRendererHeapMb] = useState(0);
  const [peakMainRssMb, setPeakMainRssMb] = useState(0);
  const [peakWorkersRssMb, setPeakWorkersRssMb] = useState(0);
  const [bulkStressRunning, setBulkStressRunning] = useState(false);
  const [workspaceBootstrapped, setWorkspaceBootstrapped] = useState(false);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceListResponse>({
    workspaces: []
  });
  const [workspaceActionBusy, setWorkspaceActionBusy] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [openWorkspacePicker, setOpenWorkspacePicker] = useState(false);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<{
    workspaceId: string;
    x: number;
    y: number;
  } | null>(null);
  const [workspaceRenameTargetId, setWorkspaceRenameTargetId] = useState<string | null>(null);
  const [workspaceRenameName, setWorkspaceRenameName] = useState("");
  const [perfPanelOpen, setPerfPanelOpen] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [dropPreview, setDropPreview] = useState<DropPreview>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState>(null);
  const tabCounterRef = useRef(0);
  const tabsRef = useRef<TabRecord[]>([]);
  const restoringWorkspaceRef = useRef(false);
  const commandChannelsRef = useRef<Map<string, (text: string) => void>>(new Map());
  const pendingCommandsRef = useRef<Map<string, string[]>>(new Map());
  const pluginTemplates = useMemo(() => listPluginViewTemplates(), []);
  const leafPaneIds = useMemo(() => listLeafPaneIds(workspace.root), [workspace.root]);
  const workspaceById = useMemo(
    () => new Map(workspaceList.workspaces.map((entry) => [entry.id, entry])),
    [workspaceList]
  );
  const openWorkspaceEntries = useMemo(
    () => workspaceList.workspaces.filter((entry) => !entry.isClosed),
    [workspaceList]
  );
  const closedWorkspaceEntries = useMemo(
    () => workspaceList.workspaces.filter((entry) => entry.isClosed),
    [workspaceList]
  );
  const persistedTabsDigest = useMemo(
    () => JSON.stringify(toPersistedTabDescriptors(tabs)),
    [tabs]
  );

  const resolvedActivePaneId = useMemo(() => {
    if (getLeafPaneById(workspace.root, workspace.activePaneId)) {
      return workspace.activePaneId;
    }
    return leafPaneIds[0] ?? "pane-1";
  }, [leafPaneIds, workspace.activePaneId, workspace.root]);

  const updateStatus = useCallback((tabId: string, status: TabRecord["status"]) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status } : t)));
  }, [setTabs]);

  const updateWsConnected = useCallback((tabId: string, connected: boolean) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, wsConnected: connected } : t)));
  }, [setTabs]);

  const recordTraffic = useCallback((tabId: string, bytes: number, lines: number) => {
    setTabPerf((prev) => {
      const current = prev[tabId] ?? initialTabPerfState();
      return {
        ...prev,
        [tabId]: {
          ...current,
          bytesTotal: current.bytesTotal + bytes,
          linesTotal: current.linesTotal + lines,
          chunks: current.chunks + 1,
          updatedAt: Date.now()
        }
      };
    });
  }, []);

  const updateTabInput = useCallback((tabId: string, input: Record<string, unknown>) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              input
            }
          : tab
      )
    );
  }, [setTabs]);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title
            }
          : tab
      )
    );
  }, [setTabs]);

  const createTabWithDriver = useCallback(async (payload: {
    tabKind: TabKind;
    title: string;
    input: Record<string, unknown>;
    activate?: boolean;
    paneId?: string;
  }) => {
    const activate = payload.activate ?? true;
    const paneId = payload.paneId ?? resolvedActivePaneId;
    const tabId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    const driver = getTabDriver(payload.tabKind);
    const initialStatus: TabRecord["status"] = payload.tabKind === "terminal.local" ? "starting" : "idle";
    const tab: TabRecord = {
      id: tabId,
      tabKind: payload.tabKind,
      title: payload.title,
      input: payload.input,
      status: initialStatus,
      wsConnected: false
    };
    setTabs((prev) => [...prev, tab]);
    addTabToPane({ paneId, tabId });
    if (activate) setActiveTabId(tabId);

    try {
      const handle = await driver.create(payload.input as never);
      const session = handle.session;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                session,
                status: handle.status
              }
            : t
        )
      );
    } catch (error) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                status: "error"
              }
            : t
        )
      );
      console.error("create session failed", error);
    }
    return tabId;
  }, [addTabToPane, resolvedActivePaneId, setActiveTabId, setTabs]);

  const createLocalTerminalTab = useCallback(async (activate = true, paneId = resolvedActivePaneId) => {
    tabCounterRef.current += 1;
    return await createTabWithDriver({
      tabKind: "terminal.local",
      title: nextTabTitle(tabCounterRef.current),
      input: DEFAULT_LOCAL_TERMINAL_INPUT,
      activate,
      paneId
    });
  }, [createTabWithDriver, resolvedActivePaneId]);

  const createPluginViewTab = useCallback(async (request: OpenPluginViewRequest) => {
    const template = pluginTemplates.find(
      (entry) =>
        entry.viewId === request.viewId &&
        (request.pluginId ? entry.pluginId === request.pluginId : true)
    );
    if (!template) {
      console.error("plugin template not found", request);
      return "";
    }
    const input = makePluginViewInput(template, request.state);
    const payload: {
      tabKind: "plugin.view";
      title: string;
      input: Record<string, unknown>;
      activate: boolean;
      paneId?: string;
    } = {
      tabKind: "plugin.view",
      title: request.title?.trim() || template.title,
      input: input as Record<string, unknown>,
      activate: true
    };
    if (request.paneId) {
      payload.paneId = request.paneId;
    }
    return await createTabWithDriver(payload);
  }, [createTabWithDriver, pluginTemplates]);

  const closeTab = async (tabId: string) => {
    const snapshot = tabs;
    const target = snapshot.find((t) => t.id === tabId);
    if (target) {
      const driver = getTabDriver(target.tabKind);
      await driver.dispose({
        session: target.session,
        status: target.status
      });
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    removeTabFromPane({ tabId });
    if (activeTabId === tabId) {
      const next = snapshot.find((t) => t.id !== tabId);
      setActiveTabId(next?.id ?? "");
    }
    commandChannelsRef.current.delete(tabId);
    pendingCommandsRef.current.delete(tabId);
  };

  const updateCommandChannel = useCallback((tabId: string, send: ((text: string) => void) | null) => {
    if (send) {
      commandChannelsRef.current.set(tabId, send);
      const pending = pendingCommandsRef.current.get(tabId);
      if (pending?.length) {
        for (const cmd of pending) {
          send(cmd);
        }
        pendingCommandsRef.current.delete(tabId);
      }
    } else {
      commandChannelsRef.current.delete(tabId);
    }
  }, []);

  const sendOrQueueCommand = useCallback((tabId: string, command: string) => {
    const send = commandChannelsRef.current.get(tabId);
    if (send) {
      send(command);
      return true;
    }
    const pending = pendingCommandsRef.current.get(tabId) ?? [];
    pending.push(command);
    pendingCommandsRef.current.set(tabId, pending);
    return false;
  }, []);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const refreshWorkspaceList = useCallback(async () => {
    const listed = await window.localtermApi.workspace.list();
    setWorkspaceList(listed);
    return listed;
  }, []);

  const buildWorkspaceSnapshot = useCallback(
    (overrides?: Partial<WorkspaceSnapshot["layout"]>): WorkspaceSnapshot => {
      const tabsForPersistence = JSON.parse(persistedTabsDigest) as WorkspaceSnapshot["tabs"];
      return {
        layout: {
          ...workspace,
          ...overrides,
          updatedAt: Date.now()
        },
        tabs: tabsForPersistence
      };
    },
    [persistedTabsDigest, workspace]
  );

  const disposeTabs = useCallback(async (records: TabRecord[]) => {
    await Promise.all(
      records.map(async (record) => {
        try {
          const driver = getTabDriver(record.tabKind);
          await driver.dispose({
            session: record.session,
            status: record.status
          });
        } catch {
          // ignore one-off dispose failures when switching workspace
        }
      })
    );
  }, []);

  const restoreWorkspaceSnapshot = useCallback(async (snapshot: WorkspaceSnapshot | null, options: { killExisting: boolean; coldBoot: boolean }) => {
    restoringWorkspaceRef.current = true;
    try {
      if (options.killExisting) {
        await disposeTabs(tabsRef.current);
      }

      commandChannelsRef.current.clear();
      pendingCommandsRef.current.clear();

      if (!snapshot) {
        setWorkspace(createDefaultWorkspaceLayout());
        setTabs([]);
        setActiveTabId("");
        return;
      }

      setWorkspace(snapshot.layout);

      // Hot switch mode: merge layout with existing tabs
      if (!options.coldBoot) {
        // Update active tab to match new layout, but keep all existing tabs alive
        setActiveTabId(resolveInitialActiveTabId(snapshot.layout.root, snapshot.layout.activePaneId));

        // Merge tabs: keep existing running tabs, add any new tabs from snapshot
        setTabs((currentTabs) => {
          const currentTabsById = new Map(currentTabs.map(t => [t.id, t]));
          const newTabs: TabRecord[] = [];

          // Add all tabs from new layout (preserve running state if already exists)
          for (const descriptor of snapshot.tabs) {
            const existing = currentTabsById.get(descriptor.id);
            if (existing) {
              // Keep existing tab with its live session
              newTabs.push(existing);
              currentTabsById.delete(descriptor.id);
            } else {
              // Add new tab from snapshot (will need to create session if restorePolicy=recreate)
              newTabs.push({
                id: descriptor.id,
                tabKind: descriptor.tabKind,
                title: descriptor.customTitle ?? descriptor.title,
                input: descriptor.input,
                status: descriptor.restorePolicy === "recreate" ? "starting" : "idle",
                wsConnected: false
              });
            }
          }

          // Keep any orphaned tabs from current workspace (not in new layout) - they stay alive in background
          for (const orphanedTab of currentTabsById.values()) {
            newTabs.push(orphanedTab);
          }

          return newTabs;
        });
        return;
      }

      // Cold boot mode: restore tabs according to restorePolicy
      const restoredTabs: TabRecord[] = snapshot.tabs.map((descriptor) => ({
        id: descriptor.id,
        tabKind: descriptor.tabKind,
        title: descriptor.customTitle ?? descriptor.title,
        input: descriptor.input,
        status: descriptor.restorePolicy === "recreate" ? "starting" : "idle",
        wsConnected: false
      }));
      tabCounterRef.current = Math.max(tabCounterRef.current, restoredTabs.length);
      setTabs(restoredTabs);
      setActiveTabId(resolveInitialActiveTabId(snapshot.layout.root, snapshot.layout.activePaneId));

      for (const descriptor of snapshot.tabs) {
        if (descriptor.restorePolicy !== "recreate") continue;
        if (descriptor.tabKind !== "terminal.local") continue;

        try {
          const driver = getTabDriver("terminal.local");
          const handle = await driver.restore(descriptor.input as LocalTerminalDriverInput);
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === descriptor.id
                ? {
                    ...tab,
                    input: descriptor.input,
                    session: handle.session,
                    status: handle.status
                  }
                : tab
            )
          );
        } catch (error) {
          console.error("restore tab failed", descriptor.id, error);
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === descriptor.id
                ? {
                    ...tab,
                    status: "error"
                  }
                : tab
            )
          );
        }
      }
    } finally {
      restoringWorkspaceRef.current = false;
    }
  }, [disposeTabs, setActiveTabId, setTabs, setWorkspace]);

  const saveWorkspaceNow = useCallback(async () => {
    const snapshot = buildWorkspaceSnapshot();
    await window.localtermApi.workspace.save(snapshot);
    await refreshWorkspaceList();
  }, [buildWorkspaceSnapshot, refreshWorkspaceList]);

  const canPersistCurrentWorkspace = useCallback(() => {
    const entry = workspaceById.get(workspace.id);
    return Boolean(entry && !entry.isClosed);
  }, [workspace.id, workspaceById]);
  const hasActiveWorkspace = useMemo(
    () => openWorkspaceEntries.some((entry) => entry.id === workspace.id),
    [openWorkspaceEntries, workspace.id]
  );

  const saveWorkspaceAsNew = useCallback(async () => {
    const nextName = saveAsName.trim();
    if (!nextName) return;
    const nextId = `${workspaceIdFromName(nextName)}-${Date.now().toString(36).slice(-4)}`;
    const snapshot = buildWorkspaceSnapshot({
      id: nextId,
      name: nextName
    });
    await window.localtermApi.workspace.save(snapshot);
    // Use restoreWorkspaceSnapshot with hot switch to preserve existing sessions
    await restoreWorkspaceSnapshot(snapshot, { killExisting: false, coldBoot: false });
    setSaveAsOpen(false);
    setSaveAsName("");
    await refreshWorkspaceList();
  }, [buildWorkspaceSnapshot, refreshWorkspaceList, restoreWorkspaceSnapshot, saveAsName]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceBootstrapped) return;
    if (workspaceId === workspace.id) return;
    setWorkspaceActionBusy(true);
    try {
      if (canPersistCurrentWorkspace()) {
        await saveWorkspaceNow();
      }
      const snapshot = await window.localtermApi.workspace.load({ id: workspaceId });
      // Hot switch: don't kill existing sessions, just change layout
      await restoreWorkspaceSnapshot(snapshot, { killExisting: false, coldBoot: false });
      await refreshWorkspaceList();
    } finally {
      setWorkspaceActionBusy(false);
    }
  }, [
    canPersistCurrentWorkspace,
    refreshWorkspaceList,
    restoreWorkspaceSnapshot,
    saveWorkspaceNow,
    workspace.id,
    workspaceBootstrapped
  ]);

  const createEmptyWorkspace = useCallback(async () => {
    const now = Date.now();
    const id = `workspace-${now.toString(36)}`;
    const name = `Workspace ${workspaceList.workspaces.length + 1}`;
    const nextSnapshot: WorkspaceSnapshot = {
      layout: {
        ...createDefaultWorkspaceLayout(now),
        id,
        name
      },
      tabs: []
    };
    setWorkspaceActionBusy(true);
    try {
      // Save current state before creating new workspace
      if (canPersistCurrentWorkspace()) {
        await saveWorkspaceNow();
      }

      // Create and switch to the new workspace
      await restoreWorkspaceSnapshot(nextSnapshot, { killExisting: false, coldBoot: false });

      // Persist the newly created workspace using its explicit snapshot (avoid stale state saves).
      await window.localtermApi.workspace.save(nextSnapshot);
      await refreshWorkspaceList();
    } finally {
      setWorkspaceActionBusy(false);
    }
  }, [
    canPersistCurrentWorkspace,
    refreshWorkspaceList,
    restoreWorkspaceSnapshot,
    saveWorkspaceNow,
    workspaceList.workspaces.length
  ]);

  const renameWorkspace = useCallback(async () => {
    if (!workspaceRenameTargetId) return;
    const nextName = workspaceRenameName.trim();
    if (!nextName) return;
    setWorkspaceActionBusy(true);
    try {
      if (workspaceRenameTargetId === workspace.id) {
        const snapshot = buildWorkspaceSnapshot({
          name: nextName
        });
        await window.localtermApi.workspace.save(snapshot);
        // Use restoreWorkspaceSnapshot with hot switch to preserve existing sessions
        await restoreWorkspaceSnapshot(snapshot, { killExisting: false, coldBoot: false });
      } else {
        const snapshot = await window.localtermApi.workspace.load({ id: workspaceRenameTargetId });
        snapshot.layout.name = nextName;
        snapshot.layout.updatedAt = Date.now();
        await window.localtermApi.workspace.save(snapshot);
      }
      await refreshWorkspaceList();
    } finally {
      setWorkspaceActionBusy(false);
      setWorkspaceRenameTargetId(null);
      setWorkspaceRenameName("");
    }
  }, [
    buildWorkspaceSnapshot,
    refreshWorkspaceList,
    restoreWorkspaceSnapshot,
    workspace.id,
    workspaceRenameName,
    workspaceRenameTargetId
  ]);

  const closeWorkspaceById = useCallback(async (workspaceId: string) => {
    setWorkspaceActionBusy(true);
    try {
      if (workspaceId === workspace.id && canPersistCurrentWorkspace()) {
        await saveWorkspaceNow();
      }

      // Soft close: keep snapshot and metadata, hide from active sidebar list.
      await window.localtermApi.workspace.close({ id: workspaceId });
      const listed = await refreshWorkspaceList();
      if (workspaceId !== workspace.id) {
        return;
      }

      const nextId = listed.workspaces.find((entry) => !entry.isClosed)?.id;
      if (nextId) {
        const snapshot = await window.localtermApi.workspace.load({ id: nextId });
        // Switching to another workspace = hot switch (keep existing sessions)
        await restoreWorkspaceSnapshot(snapshot, { killExisting: false, coldBoot: false });
        await refreshWorkspaceList();
        return;
      }

      // No active workspace left: switch to a transient workspace without persisting it.
      const now = Date.now();
      const fresh: WorkspaceSnapshot = {
        layout: createDefaultWorkspaceLayout(now),
        tabs: []
      };

      // Closing the last workspace should clear active runtime tabs.
      await restoreWorkspaceSnapshot(fresh, { killExisting: true, coldBoot: true });
    } finally {
      setWorkspaceActionBusy(false);
    }
  }, [
    canPersistCurrentWorkspace,
    refreshWorkspaceList,
    restoreWorkspaceSnapshot,
    saveWorkspaceNow,
    workspace.id
  ]);

  const commitTabRename = useCallback(() => {
    const nextTitle = renamingTitle.trim();
    if (!renamingTabId) return;
    setRenamingTabId(null);
    if (!nextTitle) return;
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === renamingTabId
          ? {
              ...tab,
              title: nextTitle
            }
          : tab
      )
    );
  }, [renamingTabId, renamingTitle, setTabs]);

  const moveTabToSplitPane = useCallback(
    (
      tabId: string,
      paneId: string,
      direction: PaneDirection,
      placeNewPaneFirst: boolean
    ) => {
      const newPaneId = `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      splitPane({
        paneId,
        direction,
        newPaneId,
        placeNewPaneFirst
      });
      moveTab({ tabId, targetPaneId: newPaneId });
      activateTabInPane({ paneId: newPaneId, tabId });
      setActivePane({ paneId: newPaneId });
      setActiveTabId(tabId);
      setDropPreview(null);
    },
    [activateTabInPane, moveTab, setActivePane, setActiveTabId, splitPane]
  );

  useEffect(() => {
    if (!tabContextMenu) return;
    const handleMouseDown = () => setTabContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTabContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [tabContextMenu]);

  useEffect(() => {
    if (!workspaceContextMenu && !plusMenuOpen && !settingsMenuOpen) return;
    const onMouseDown = () => {
      setWorkspaceContextMenu(null);
      setPlusMenuOpen(false);
      setSettingsMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkspaceContextMenu(null);
        setPlusMenuOpen(false);
        setSettingsMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [plusMenuOpen, settingsMenuOpen, workspaceContextMenu]);

  useEffect(() => {
    let cancelled = false;

    const bootstrapWorkspace = async () => {
      try {
        const [result, listed] = await Promise.all([
          window.localtermApi.workspace.getDefault(),
          window.localtermApi.workspace.list()
        ]);
        if (cancelled) return;
        setWorkspaceList(listed);
        const snapshot = result.workspace;
        // App startup = cold boot, restore sessions according to restorePolicy
        await restoreWorkspaceSnapshot(snapshot, { killExisting: false, coldBoot: true });
      } catch (error) {
        if (!cancelled) {
          console.error("workspace bootstrap failed", error);
        }
      } finally {
        if (!cancelled) {
          setWorkspaceBootstrapped(true);
        }
      }
    };

    void bootstrapWorkspace();

    return () => {
      cancelled = true;
    };
  }, [restoreWorkspaceSnapshot]);

  useEffect(() => {
    if (!workspaceBootstrapped) return;
    if (workspaceActionBusy) return;
    if (restoringWorkspaceRef.current) return;
    const currentWorkspaceMeta = workspaceById.get(workspace.id);
    if (!currentWorkspaceMeta || currentWorkspaceMeta.isClosed) return;
    const timer = setTimeout(() => {
      const snapshot = buildWorkspaceSnapshot();
      void window.localtermApi.workspace.save(snapshot).catch((error) => {
        console.error("workspace autosave failed", error);
      });
    }, WORKSPACE_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [
    buildWorkspaceSnapshot,
    persistedTabsDigest,
    workspace,
    workspace.id,
    workspaceActionBusy,
    workspaceBootstrapped,
    workspaceById
  ]);

  useEffect(() => {
    const validIds = new Set(tabs.map((tab) => tab.id));
    setTabPerf((prev) => {
      const next: Record<string, TabPerfState> = {};
      for (const [id, perf] of Object.entries(prev)) {
        if (validIds.has(id)) next[id] = perf;
      }
      return next;
    });
  }, [tabs]);

  useEffect(() => {
    if (!perfRunning) return;
    let cancelled = false;
    const interval = setInterval(() => {
      setTabPerf((prev) => {
        const next: Record<string, TabPerfState> = {};
        for (const [tabId, perf] of Object.entries(prev)) {
          const deltaBytes = perf.bytesTotal - perf.lastSampleBytes;
          const deltaLines = perf.linesTotal - perf.lastSampleLines;
          next[tabId] = {
            ...perf,
            rateBps: deltaBytes,
            rateLps: deltaLines,
            lastSampleBytes: perf.bytesTotal,
            lastSampleLines: perf.linesTotal
          };
        }
        return next;
      });

      void window.localtermApi.system.getMetrics().then((system) => {
        if (cancelled) return;
        const perfMem = (performance as Performance & {
          memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
        }).memory;
        const rendererHeapUsedMb = perfMem ? perfMem.usedJSHeapSize / 1024 / 1024 : null;
        const rendererHeapTotalMb = perfMem ? perfMem.totalJSHeapSize / 1024 / 1024 : null;
        const mainRssMb = system.main.rss / 1024 / 1024;
        const workersRssMb = system.workersTotalRssKb / 1024;
        const activeWorkerCount = system.workers.filter(
          (w) => w.status === "starting" || w.status === "ready"
        ).length;
        setMemorySample({
          sampledAt: Date.now(),
          rendererHeapUsedMb,
          rendererHeapTotalMb,
          mainRssMb,
          workersRssMb,
          activeWorkerCount
        });
        if (rendererHeapUsedMb != null) setPeakRendererHeapMb((prev) => Math.max(prev, rendererHeapUsedMb));
        setPeakMainRssMb((prev) => Math.max(prev, mainRssMb));
        setPeakWorkersRssMb((prev) => Math.max(prev, workersRssMb));
      }).catch(() => {
        // ignore one-off sampling errors during shutdown/reload
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [perfRunning]);

  const runSeconds = useMemo(() => {
    if (!perfStartedAt) return 0;
    const end = memorySample?.sampledAt ?? Date.now();
    return Math.max(0, Math.floor((end - perfStartedAt) / 1000));
  }, [memorySample?.sampledAt, perfStartedAt]);

  const totalBytes = useMemo(
    () => Object.values(tabPerf).reduce((sum, p) => sum + p.bytesTotal, 0),
    [tabPerf]
  );
  const totalRateBps = useMemo(
    () => Object.values(tabPerf).reduce((sum, p) => sum + p.rateBps, 0),
    [tabPerf]
  );

  const startPerf = () => {
    setPerfRunning(true);
    setPerfStartedAt(Date.now());
  };

  const stopPerf = () => {
    setPerfRunning(false);
  };

  const resetPerf = () => {
    setTabPerf({});
    setMemorySample(null);
    setPeakRendererHeapMb(0);
    setPeakMainRssMb(0);
    setPeakWorkersRssMb(0);
    setPerfStartedAt(perfRunning ? Date.now() : null);
  };

  const runBulkStress = useCallback(async () => {
    if (bulkStressRunning) return;
    setBulkStressRunning(true);
    try {
      if (!perfRunning) {
        setPerfRunning(true);
        setPerfStartedAt(Date.now());
      }

      const createdTabIds: string[] = [];
      // Use the same stable path as manual creation: activate each new tab during bootstrap.
      for (let i = 0; i < BULK_STRESS_DEFAULTS.sessions; i++) {
        const tabId = await createLocalTerminalTab(true);
        createdTabIds.push(tabId);
        // Give renderer/ws a short settle time before creating the next one.
        await sleep(120);
      }

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (createdTabIds.every((tabId) => commandChannelsRef.current.has(tabId))) {
          break;
        }
        // wait for ws onopen in all newly created terminal panes
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const command = buildStressCommand(
        BULK_STRESS_DEFAULTS.durationSec,
        BULK_STRESS_DEFAULTS.burstPerTick,
        BULK_STRESS_DEFAULTS.payloadSize
      );
      console.log("[bulk-stress] Generated command:", JSON.stringify(command));
      console.log("[bulk-stress] Command length:", command.length, "chars");
      console.log("[bulk-stress] Command bytes:", Array.from(command).map(c => c.charCodeAt(0)).slice(-10));

      let launched = 0;
      for (const tabId of createdTabIds) {
        if (sendOrQueueCommand(tabId, command)) launched += 1;
      }

      const firstCreatedTabId = createdTabIds[0];
      if (firstCreatedTabId) {
        setActiveTabId(firstCreatedTabId);
      }

      setDebugText(
        JSON.stringify(
          {
            action: "bulk-stress-started",
            requestedSessions: BULK_STRESS_DEFAULTS.sessions,
            launchedSessions: launched,
            durationSec: BULK_STRESS_DEFAULTS.durationSec,
            burstPerTick: BULK_STRESS_DEFAULTS.burstPerTick,
            payloadSize: BULK_STRESS_DEFAULTS.payloadSize
          },
          null,
          2
        )
      );
    } catch (error) {
      console.error("bulk stress failed", error);
      setDebugText(
        JSON.stringify(
          {
            action: "bulk-stress-failed",
            error: error instanceof Error ? error.message : String(error)
          },
          null,
          2
        )
      );
    } finally {
      setBulkStressRunning(false);
    }
  }, [bulkStressRunning, createLocalTerminalTab, perfRunning, sendOrQueueCommand, setActiveTabId]);

  const tabsById = useMemo(() => {
    return new Map(tabs.map((tab) => [tab.id, tab]));
  }, [tabs]);

  const splitActivePane = useCallback((direction: PaneDirection) => {
    try {
      splitPane({ paneId: resolvedActivePaneId, direction });
    } catch (error) {
      console.error("split pane failed", error);
    }
  }, [resolvedActivePaneId, splitPane]);

  const closeActivePane = useCallback(() => {
    if (leafPaneIds.length <= 1) return;
    try {
      closePane({ paneId: resolvedActivePaneId });
    } catch (error) {
      console.error("close pane failed", error);
    }
  }, [closePane, leafPaneIds.length, resolvedActivePaneId]);

  // Collect all tab IDs that are in the current workspace layout
  const tabIdsInLayout = useMemo(() => {
    const collectTabIds = (node: PaneNode): string[] => {
      if (node.type === "leaf") {
        return node.tabIds;
      }
      return [...collectTabIds(node.children[0]), ...collectTabIds(node.children[1])];
    };
    return new Set(collectTabIds(workspace.root));
  }, [workspace.root]);

  // Orphan tabs: exist in tabs array but not in current layout
  const orphanTabs = useMemo(() => {
    return tabs.filter(tab => !tabIdsInLayout.has(tab.id));
  }, [tabs, tabIdsInLayout]);

  const [, updatePanelSizes] = useAtom(updatePanelSizesAtom);

  const renderPaneNode = useCallback((node: PaneNode): ReactNode => {
    if (node.type === "split") {
      const [first, second] = node.children;
      const [sizeA, sizeB] = node.sizes;
      const isHorizontal = node.direction === "horizontal";

      return (
        <Group
          key={node.id}
          className="h-full"
          orientation={isHorizontal ? "horizontal" : "vertical"}
        >
          <Panel
            className="min-h-0 min-w-0 focus:outline-none"
            defaultSize={sizeA * 100}
            minSize={10}
            onResize={(panelSize) => {
              const size = panelSize.asPercentage;
              const newSizeB = 100 - size;
              updatePanelSizes({ paneId: node.id, sizes: [size / 100, newSizeB / 100] });
            }}
          >
            {renderPaneNode(first)}
          </Panel>
          <Separator
            className={`${
              isHorizontal
                ? "w-1.5 cursor-col-resize hover:bg-slate-500"
                : "h-1.5 cursor-row-resize hover:bg-slate-500"
            } bg-slate-700`}
          />
          <Panel
            className="min-h-0 min-w-0 focus:outline-none"
            defaultSize={sizeB * 100}
            minSize={10}
          >
            {renderPaneNode(second)}
          </Panel>
        </Group>
      );
    }

    const paneTabs = node.tabIds
      .map((tabId) => tabsById.get(tabId))
      .filter((tab): tab is TabRecord => Boolean(tab));
    const paneActiveTabId = paneTabs.some((tab) => tab.id === node.activeTabId)
      ? node.activeTabId
      : paneTabs[0]?.id;
    const paneTitle = node.id === workspace.activePaneId ? `${node.id} (active)` : node.id;

    return (
      <section
        key={node.id}
        className={
          dropPreview?.paneId === node.id
            ? "relative grid h-full min-h-0 grid-rows-[auto_auto_1fr] gap-2 rounded-xl border border-sky-400 bg-zinc-900/40 p-2 focus:outline-none"
            : node.id === workspace.activePaneId
              ? "relative grid h-full min-h-0 grid-rows-[auto_auto_1fr] gap-2 rounded-xl border border-amber-400/80 bg-zinc-900/40 p-2 focus:outline-none"
              : "relative grid h-full min-h-0 grid-rows-[auto_auto_1fr] gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 focus:outline-none"
        }
        onMouseDown={() => setActivePane({ paneId: node.id })}
        onDragOver={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const zone = resolveDropZone(event.clientX, event.clientY, rect);
          setDropPreview({ paneId: node.id, zone });
        }}
        onDragLeave={() => {
          setDropPreview((current) => (current?.paneId === node.id ? null : current));
        }}
        onDrop={(event) => {
          event.preventDefault();
          const tabId = event.dataTransfer.getData("text/localterm-tab-id");
          const zone = dropPreview?.paneId === node.id ? dropPreview.zone : "center";
          setDropPreview(null);
          if (!tabId) return;
          if (zone === "center") {
            moveTab({ tabId, targetPaneId: node.id });
            activateTabInPane({ paneId: node.id, tabId });
            setActivePane({ paneId: node.id });
            setActiveTabId(tabId);
            return;
          }
          if (zone === "left") {
            moveTabToSplitPane(tabId, node.id, "horizontal", true);
            return;
          }
          if (zone === "right") {
            moveTabToSplitPane(tabId, node.id, "horizontal", false);
            return;
          }
          if (zone === "top") {
            moveTabToSplitPane(tabId, node.id, "vertical", true);
            return;
          }
          moveTabToSplitPane(tabId, node.id, "vertical", false);
        }}
      >
        <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-400">
          <span>{paneTitle}</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                setActivePane({ paneId: node.id });
                void createLocalTerminalTab(true, node.id);
              }}
            >
              +Term
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                void createPluginViewTab({
                  viewId: "file.browser",
                  paneId: node.id
                });
              }}
            >
              +File
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                void createPluginViewTab({
                  viewId: "widget.markdown",
                  paneId: node.id
                });
              }}
            >
              +Note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => splitPane({ paneId: node.id, direction: "horizontal" })}
            >
              Split H
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => splitPane({ paneId: node.id, direction: "vertical" })}
            >
              Split V
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => closePane({ paneId: node.id })}
              disabled={leafPaneIds.length <= 1}
            >
              Close
            </Button>
          </div>
        </div>

        {dropPreview?.paneId === node.id ? (
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className={dropPreviewOverlayClass(dropPreview.zone)} />
          </div>
        ) : null}

        <Tabs
          value={paneActiveTabId || `__none-${node.id}`}
          onValueChange={(value) => {
            if (value.startsWith("__none-")) return;
            activateTabInPane({ paneId: node.id, tabId: value });
            setActivePane({ paneId: node.id });
            setActiveTabId(value);
          }}
          className="min-h-0"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            {paneTabs.length === 0 ? (
              <TabsTrigger value={`__none-${node.id}`} disabled>
                Empty Pane
              </TabsTrigger>
            ) : (
              paneTabs.map((tab) => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/localterm-tab-id", tab.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDropPreview(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setTabContextMenu({
                      tabId: tab.id,
                      paneId: node.id,
                      x: event.clientX,
                      y: event.clientY
                    });
                  }}
                  className="flex items-center gap-1 rounded-md border border-transparent px-1"
                >
                  <TabsTrigger value={tab.id} className="max-w-[180px]">
                    {renamingTabId === tab.id ? (
                      <input
                        className="h-6 w-[120px] rounded border border-zinc-700 bg-zinc-950 px-1 text-xs text-zinc-100 outline-none"
                        value={renamingTitle}
                        autoFocus
                        onChange={(event) => setRenamingTitle(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitTabRename();
                          }
                          if (event.key === "Escape") {
                            setRenamingTabId(null);
                          }
                        }}
                        onBlur={commitTabRename}
                      />
                    ) : (
                      <span
                        className="truncate"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setRenamingTabId(tab.id);
                          setRenamingTitle(tab.title);
                        }}
                      >
                        {tab.title}
                      </span>
                    )}
                    <span className="ml-1 text-[10px] text-zinc-400">[{tab.status}]</span>
                  </TabsTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void closeTab(tab.id);
                    }}
                    aria-label={`Close ${tab.title}`}
                  >
                    ×
                  </Button>
                </div>
              ))
            )}
          </TabsList>
        </Tabs>

        <div className="min-h-0">
          {paneTabs.length > 0 ? (
            <div className="relative h-full min-h-0">
              {paneTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={
                    tab.id === paneActiveTabId
                      ? "absolute inset-0 h-full min-h-0"
                      : "pointer-events-none invisible absolute inset-0 h-full min-h-0"
                  }
                >
                  {tab.tabKind === "terminal.local" ? (
                    <TerminalPane
                      tab={tab}
                      isActive={tab.id === activeTabId}
                      onTraffic={recordTraffic}
                      onCommandChannel={updateCommandChannel}
                      onStatus={updateStatus}
                      onWsConnected={updateWsConnected}
                    />
                  ) : tab.tabKind === "plugin.view" ? (
                    <PluginTabPane
                      tab={tab}
                      isActive={tab.id === activeTabId}
                      onUpdateInput={updateTabInput}
                      onUpdateTitle={updateTabTitle}
                      onOpenPluginView={(request) => {
                        void createPluginViewTab({
                          ...request,
                          paneId: request.paneId ?? node.id
                        });
                      }}
                    />
                  ) : (
                    <div className="grid h-full min-h-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-xs text-zinc-500">
                      Unsupported tab kind: {tab.tabKind}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-full min-h-0 place-items-center rounded-lg border border-dashed border-zinc-800 text-zinc-500">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setActivePane({ paneId: node.id });
                  void createLocalTerminalTab(true, node.id);
                }}
              >
                New Terminal In Pane
              </Button>
            </div>
          )}
        </div>
      </section>
    );
  }, [
    activateTabInPane,
    activeTabId,
    commitTabRename,
    closePane,
    closeTab,
    createLocalTerminalTab,
    createPluginViewTab,
    dropPreview,
    leafPaneIds.length,
    moveTabToSplitPane,
    moveTab,
    recordTraffic,
    renamingTabId,
    renamingTitle,
    setActivePane,
    setActiveTabId,
    setRenamingTabId,
    setRenamingTitle,
    setDropPreview,
    setTabContextMenu,
    splitPane,
    tabsById,
    updateCommandChannel,
    updatePanelSizes,
    updateTabInput,
    updateTabTitle,
    updateStatus,
    updateWsConnected,
    workspace.activePaneId
  ]);

  return (
    <div className="grid h-screen grid-cols-[76px_1fr] gap-3 bg-zinc-950 p-3 text-zinc-100">
      <aside className="relative flex min-h-0 flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
        <div className="relative">
          <Button
            variant="secondary"
            size="icon"
            className="h-11 w-11 rounded-2xl"
            onClick={(event) => {
              event.stopPropagation();
              setPlusMenuOpen((open) => !open);
            }}
            disabled={workspaceActionBusy}
            title="Workspace Menu"
          >
            +
          </Button>
          {plusMenuOpen ? (
            <div
              className="absolute left-12 top-0 z-40 min-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setPlusMenuOpen(false);
                  void createEmptyWorkspace();
                }}
              >
                New Workspace
              </button>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setPlusMenuOpen(false);
                  setOpenWorkspacePicker(true);
                }}
              >
                Open Saved Workspace
              </button>
            </div>
          ) : null}
        </div>
        <div className="h-px w-10 bg-zinc-700" />
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto">
          {openWorkspaceEntries.map((entry) => {
            const active = entry.id === workspace.id;
            return (
              <button
                key={entry.id}
                type="button"
                disabled={workspaceActionBusy}
                title={entry.name}
                onClick={() => void switchWorkspace(entry.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setWorkspaceContextMenu({
                    workspaceId: entry.id,
                    x: event.clientX,
                    y: event.clientY
                  });
                }}
                className={
                  active
                    ? "h-11 w-11 rounded-2xl border border-amber-400 bg-zinc-800 text-xs font-semibold text-zinc-100"
                    : "h-11 w-11 rounded-2xl border border-zinc-700 bg-zinc-800/70 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
                }
              >
                {workspaceBadge(entry.name)}
              </button>
            );
          })}
        </div>
        <div className="relative mt-auto">
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 rounded-xl"
            onClick={(event) => {
              event.stopPropagation();
              setSettingsMenuOpen((open) => !open);
            }}
            title="Settings"
          >
            ⚙
          </Button>
          {settingsMenuOpen ? (
            <div
              className="absolute bottom-0 left-12 z-40 min-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setSettingsMenuOpen(false);
                  setPerfPanelOpen(true);
                }}
              >
                Perf Panel
              </button>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setSettingsMenuOpen(false);
                  setDebugPanelOpen(true);
                }}
              >
                Debug Sessions
              </button>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  if (!hasActiveWorkspace) return;
                  setSettingsMenuOpen(false);
                  setSaveAsOpen(true);
                }}
                disabled={!hasActiveWorkspace}
              >
                Save As
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className={hasActiveWorkspace ? "min-h-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2" : "min-h-0 p-2"}>
        {hasActiveWorkspace ? (
          renderPaneNode(workspace.root)
        ) : (
          <div className="grid h-full min-h-0 place-items-center text-zinc-500">
            <div className="space-y-2 text-center">
              <div className="text-sm text-zinc-300">No active workspace</div>
              <div className="text-xs">Create a new workspace or open one from history.</div>
            </div>
          </div>
        )}
      </main>

      {/* Hidden container for orphan tabs from other workspaces - keeps WebSocket connections alive */}
      {orphanTabs.length > 0 && (
        <div className="hidden" aria-hidden="true">
          {orphanTabs.map((tab) => {
            if (tab.tabKind === "terminal.local") {
              return (
                <div key={tab.id} data-orphan-tab={tab.id}>
                  <TerminalPane
                    tab={tab}
                    isActive={false}
                    onTraffic={recordTraffic}
                    onCommandChannel={updateCommandChannel}
                    onStatus={updateStatus}
                    onWsConnected={updateWsConnected}
                  />
                </div>
              );
            }
            if (tab.tabKind === "plugin.view") {
              return (
                <div key={tab.id} data-orphan-tab={tab.id}>
                  <PluginTabPane
                    tab={tab}
                    isActive={false}
                    onUpdateInput={updateTabInput}
                    onUpdateTitle={updateTabTitle}
                    onOpenPluginView={(request) => {
                      void createPluginViewTab({
                        ...request,
                        paneId: workspace.activePaneId
                      });
                    }}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {workspaceContextMenu ? (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-2xl"
          style={{ left: workspaceContextMenu.x, top: workspaceContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              const entry = workspaceById.get(workspaceContextMenu.workspaceId);
              if (entry) {
                setWorkspaceRenameTargetId(entry.id);
                setWorkspaceRenameName(entry.name);
              }
              setWorkspaceContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              const targetId = workspaceContextMenu.workspaceId;
              setWorkspaceContextMenu(null);
              void (async () => {
                if (targetId === workspace.id) {
                  if (canPersistCurrentWorkspace()) {
                    await saveWorkspaceNow();
                  }
                  return;
                }
                await switchWorkspace(targetId);
              })();
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-800"
            onClick={() => {
              const targetId = workspaceContextMenu.workspaceId;
              setWorkspaceContextMenu(null);
              void closeWorkspaceById(targetId);
            }}
          >
            Close
          </button>
        </div>
      ) : null}

      {tabContextMenu ? (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-2xl"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              const tab = tabsById.get(tabContextMenu.tabId);
              if (tab) {
                setRenamingTabId(tab.id);
                setRenamingTitle(tab.title);
              }
              setTabContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              moveTabToSplitPane(tabContextMenu.tabId, tabContextMenu.paneId, "horizontal", false);
              setTabContextMenu(null);
            }}
          >
            Move To New Split
          </button>
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-800"
            onClick={() => {
              void closeTab(tabContextMenu.tabId);
              setTabContextMenu(null);
            }}
          >
            Close
          </button>
        </div>
      ) : null}

      <Dialog open={openWorkspacePicker} onOpenChange={setOpenWorkspacePicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Workspace</DialogTitle>
            <DialogDescription>Choose from saved and history workspaces.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {[...closedWorkspaceEntries, ...openWorkspaceEntries].map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-sm text-zinc-100 hover:border-zinc-600"
                onClick={() => {
                  setOpenWorkspacePicker(false);
                  void switchWorkspace(entry.id);
                }}
              >
                <span className="truncate">{entry.name}</span>
                <span className="text-xs text-zinc-400">
                  {entry.isClosed ? "History" : "Open"} · {entry.id}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Workspace As</DialogTitle>
            <DialogDescription>Create a new workspace snapshot from current layout.</DialogDescription>
          </DialogHeader>
          <input
            className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none"
            value={saveAsName}
            onChange={(event) => setSaveAsName(event.target.value)}
            placeholder="Workspace name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveWorkspaceAsNew()} disabled={!saveAsName.trim()}>
              Save As New
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workspaceRenameTargetId !== null} onOpenChange={(open) => {
        if (!open) {
          setWorkspaceRenameTargetId(null);
          setWorkspaceRenameName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Workspace</DialogTitle>
            <DialogDescription>Set a new name for this workspace.</DialogDescription>
          </DialogHeader>
          <input
            className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none"
            value={workspaceRenameName}
            onChange={(event) => setWorkspaceRenameName(event.target.value)}
            placeholder="Workspace name"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWorkspaceRenameTargetId(null);
                setWorkspaceRenameName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void renameWorkspace()} disabled={!workspaceRenameName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={perfPanelOpen} onOpenChange={setPerfPanelOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Performance Panel</DialogTitle>
            <DialogDescription>
              Realtime throughput and memory telemetry for tab sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <div className="text-xs text-zinc-400">Run Time</div>
                <div className="font-mono text-zinc-100">{runSeconds}s</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <div className="text-xs text-zinc-400">Total Output</div>
                <div className="font-mono text-zinc-100">{formatBytes(totalBytes)}</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <div className="text-xs text-zinc-400">Current Throughput</div>
                <div className="font-mono text-zinc-100">{formatRate(totalRateBps)}</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <div className="text-xs text-zinc-400">Main RSS</div>
                <div className="font-mono text-zinc-100">
                  {memorySample ? `${memorySample.mainRssMb.toFixed(1)} MB` : "-"}
                </div>
                <div className="text-[11px] text-zinc-500">peak {peakMainRssMb.toFixed(1)} MB</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <div className="text-xs text-zinc-400">Worker RSS</div>
                <div className="font-mono text-zinc-100">
                  {memorySample ? `${memorySample.workersRssMb.toFixed(1)} MB` : "-"}
                </div>
                <div className="text-[11px] text-zinc-500">
                  peak {peakWorkersRssMb.toFixed(1)} MB · active {memorySample?.activeWorkerCount ?? 0}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400">
              Renderer Heap:{" "}
              {memorySample?.rendererHeapUsedMb != null
                ? `${memorySample.rendererHeapUsedMb.toFixed(1)} MB / ${memorySample.rendererHeapTotalMb?.toFixed(1) ?? "-"} MB`
                : "not available"}{" "}
              · peak {peakRendererHeapMb.toFixed(1)} MB
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-md border border-zinc-800 bg-zinc-900">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="px-2 py-2 text-left">Tab</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">WS</th>
                    <th className="px-2 py-2 text-right">Output</th>
                    <th className="px-2 py-2 text-right">Lines</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">Lines/s</th>
                  </tr>
                </thead>
                <tbody>
                  {tabs.map((tab) => {
                    const perf = tabPerf[tab.id] ?? initialTabPerfState();
                    return (
                      <tr key={tab.id} className="border-t border-zinc-800">
                        <td className="px-2 py-1 font-mono">{tab.title}</td>
                        <td className="px-2 py-1">{tab.status}</td>
                        <td className="px-2 py-1">{tab.wsConnected ? "connected" : "disconnected"}</td>
                        <td className="px-2 py-1 text-right font-mono">{formatBytes(perf.bytesTotal)}</td>
                        <td className="px-2 py-1 text-right font-mono">{formatLines(perf.linesTotal)}</td>
                        <td className="px-2 py-1 text-right font-mono">{formatRate(perf.rateBps)}</td>
                        <td className="px-2 py-1 text-right font-mono">{perf.rateLps.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            {perfRunning ? (
              <Button variant="secondary" onClick={stopPerf}>
                Stop
              </Button>
            ) : (
              <Button onClick={startPerf}>Start</Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void runBulkStress()}
              disabled={bulkStressRunning}
            >
              {bulkStressRunning ? "Launching..." : "Bulk Stress (4 x 5m)"}
            </Button>
            <Button variant="outline" onClick={resetPerf}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={debugPanelOpen} onOpenChange={setDebugPanelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Control Plane Sessions</DialogTitle>
            <DialogDescription>
              Reads the in-app control-plane registry via preload IPC.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-200">
            {debugText || "(click refresh)"}
          </pre>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                const data = await window.localtermApi.session.listSessions();
                setDebugText(JSON.stringify(data, null, 2));
              }}
            >
              Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
