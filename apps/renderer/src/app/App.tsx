/**
 * Main application shell.
 * Phase 1 will keep this intentionally minimal: tabs + terminal panes only.
 */
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activeTabAtom,
  activeTabIdAtom,
  tabsAtom,
  type TabRecord
} from "../lib/atoms/session";
import { TerminalPane } from "../components/TerminalPane";
import type { CreateLocalSessionResponse } from "@localterm/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom);
  const [activeTab] = useAtom(activeTabAtom);
  const [debugText, setDebugText] = useState("");
  const [perfRunning, setPerfRunning] = useState(false);
  const [perfStartedAt, setPerfStartedAt] = useState<number | null>(null);
  const [tabPerf, setTabPerf] = useState<Record<string, TabPerfState>>({});
  const [memorySample, setMemorySample] = useState<PerfMemorySample | null>(null);
  const [peakRendererHeapMb, setPeakRendererHeapMb] = useState(0);
  const [peakMainRssMb, setPeakMainRssMb] = useState(0);
  const [peakWorkersRssMb, setPeakWorkersRssMb] = useState(0);
  const [bulkStressRunning, setBulkStressRunning] = useState(false);
  const tabCounterRef = useRef(0);
  const commandChannelsRef = useRef<Map<string, (text: string) => void>>(new Map());
  const pendingCommandsRef = useRef<Map<string, string[]>>(new Map());

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

  const createTabInternal = useCallback(async (activate = true) => {
    tabCounterRef.current += 1;
    const tabId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    console.log(`[app] Creating tab ${tabId.slice(0, 8)}, count=${tabCounterRef.current}`);
    const tab: TabRecord = {
      id: tabId,
      title: nextTabTitle(tabCounterRef.current),
      status: "starting",
      wsConnected: false
    };
    setTabs((prev) => [...prev, tab]);
    if (activate) setActiveTabId(tabId);

    try {
      console.log(`[app] Requesting session for tab ${tabId.slice(0, 8)}`);
      const session = (await window.localtermApi.session.createLocalSession({
        sessionType: "local",
        cols: 120,
        rows: 30
      })) as CreateLocalSessionResponse;
      console.log(`[app] Got session ${session.sessionId.slice(0, 8)} for tab ${tabId.slice(0, 8)}, port=${session.port}`);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                session,
                status: session.status
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
  }, [setActiveTabId, setTabs]);

  const createTab = useCallback(async () => {
    await createTabInternal(true);
  }, [createTabInternal]);

  const closeTab = async (tabId: string) => {
    const snapshot = tabs;
    const target = snapshot.find((t) => t.id === tabId);
    if (target?.session) {
      await window.localtermApi.session.killSession({ sessionId: target.session.sessionId }).catch(() => {});
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
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
        const tabId = await createTabInternal(true);
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
  }, [bulkStressRunning, createTabInternal, perfRunning, sendOrQueueCommand, setActiveTabId]);

  return (
    <div className="grid h-screen grid-rows-[auto_auto_1fr] gap-3 bg-zinc-950 p-3 text-zinc-100">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
        <Button onClick={createTab}>New Local Terminal</Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Perf Panel</Button>
          </DialogTrigger>
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
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Debug Sessions</Button>
          </DialogTrigger>
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
        <div className="ml-auto text-sm text-zinc-400">
          {activeTab ? `Active: ${activeTab.title} (${activeTab.status})` : "No tab"}
        </div>
      </div>

      <Tabs
        value={activeTabId || "__none"}
        onValueChange={(value) => {
          if (value !== "__none") setActiveTabId(value);
        }}
        className="min-h-0"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {tabs.length === 0 ? (
            <TabsTrigger value="__none" disabled>
              No Tabs
            </TabsTrigger>
          ) : (
            tabs.map((tab) => (
              <div key={tab.id} className="flex items-center gap-1 rounded-md border border-transparent px-1">
                <TabsTrigger value={tab.id} className="max-w-[220px]">
                  <span className="truncate">{tab.title}</span>
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

      <main className="min-h-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2">
        {tabs.length > 0 ? (
          <div className="relative h-full min-h-0">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={
                  tab.id === activeTabId
                    ? "absolute inset-0 h-full min-h-0"
                    : "pointer-events-none invisible absolute inset-0 h-full min-h-0"
                }
              >
                <TerminalPane
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  onTraffic={recordTraffic}
                  onCommandChannel={updateCommandChannel}
                  onStatus={updateStatus}
                  onWsConnected={updateWsConnected}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-zinc-500">
            Click “New Local Terminal” to start
          </div>
        )}
      </main>
    </div>
  );
}
