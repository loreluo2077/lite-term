/**
 * Main application shell.
 * Phase 1 will keep this intentionally minimal: tabs + terminal panes only.
 */
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
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

function nextTabTitle(count: number) {
  return `Local ${count}`;
}

export function App() {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom);
  const [activeTab] = useAtom(activeTabAtom);
  const [debugText, setDebugText] = useState("");

  const appendOutput = useCallback((tabId: string, chunk: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, output: `${t.output}${chunk}` } : t)));
  }, [setTabs]);

  const updateStatus = useCallback((tabId: string, status: TabRecord["status"]) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status } : t)));
  }, [setTabs]);

  const updateWsConnected = useCallback((tabId: string, connected: boolean) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, wsConnected: connected } : t)));
  }, [setTabs]);

  const createTab = async () => {
    const tabId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    const tab: TabRecord = {
      id: tabId,
      title: nextTabTitle(tabs.length + 1),
      status: "starting",
      output: "",
      inputBuffer: "",
      wsConnected: false
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tabId);

    try {
      const session = (await window.localtermApi.session.createLocalSession({
        sessionType: "local",
        cols: 120,
        rows: 30
      })) as CreateLocalSessionResponse;
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, session, status: "starting" } : t))
      );
    } catch (error) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                status: "error",
                output: `${t.output}\n[create session error] ${
                  error instanceof Error ? error.message : String(error)
                }\n`
              }
            : t
        )
      );
    }
  };

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
  };

  return (
    <div className="grid h-screen grid-rows-[auto_auto_1fr] gap-3 bg-zinc-950 p-3 text-zinc-100">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
        <Button onClick={createTab}>New Local Terminal</Button>
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
        {activeTab ? (
          <TerminalPane
            key={activeTab.id}
            tab={activeTab}
            onAppendOutput={appendOutput}
            onStatus={updateStatus}
            onWsConnected={updateWsConnected}
          />
        ) : (
          <div className="grid h-full place-items-center text-zinc-500">
            Click “New Local Terminal” to start
          </div>
        )}
      </main>
    </div>
  );
}
