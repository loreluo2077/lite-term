/**
 * TerminalPane should remain session-type agnostic.
 * local/ssh differences are injected via session metadata.
 */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import type { TabRecord } from "../lib/atoms/session";
import { connectSessionWebSocket } from "../lib/session/connect-session-ws";

type Props = {
  tab: TabRecord;
  onAppendOutput: (tabId: string, chunk: string) => void;
  onStatus: (tabId: string, status: TabRecord["status"]) => void;
  onWsConnected: (tabId: string, connected: boolean) => void;
};

export function TerminalPane({ tab, onAppendOutput, onStatus, onWsConnected }: Props) {
  const connectionRef = useRef<ReturnType<typeof connectSessionWebSocket> | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const hostElRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const port = tab.session?.port;

  useEffect(() => {
    if (!hostElRef.current || xtermRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#fafafa",
        selectionBackground: "#3f3f46"
      },
      allowTransparency: false
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostElRef.current);
    fit.fit();
    term.writeln("localterm: session pane initialized");
    term.writeln("");
    if (tab.output) {
      term.write(tab.output);
    }

    xtermRef.current = term;
    fitRef.current = fit;

    resizeObserverRef.current = new ResizeObserver(() => {
      try {
        fit.fit();
        if (tab.session) {
          void window.localtermApi.session.resizeSession({
            sessionId: tab.session.sessionId,
            cols: term.cols,
            rows: term.rows
          });
        }
      } catch {
        // ignore transient layout errors
      }
    });
    resizeObserverRef.current.observe(hostElRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      fit.dispose();
      term.dispose();
      fitRef.current = null;
      xtermRef.current = null;
    };
  }, [tab.id, tab.output, tab.session]);

  useEffect(() => {
    if (!port) return;
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;

    const conn = connectSessionWebSocket(port, {
      onOpen: () => {
        onWsConnected(tab.id, true);
        try {
          fit.fit();
          void window.localtermApi.session.resizeSession({
            sessionId: tab.session!.sessionId,
            cols: term.cols,
            rows: term.rows
          });
        } catch {
          // noop
        }
      },
      onOutput: (text) => {
        term.write(text);
        onAppendOutput(tab.id, text);
      },
      onControlEvent: (event) => {
        if (event.type === "ready") onStatus(tab.id, "ready");
        if (event.type === "exit") {
          term.writeln(`\r\n[session exited] code=${event.exitCode ?? "null"}`);
          onStatus(tab.id, "exited");
        }
        if (event.type === "error") {
          term.writeln(`\r\n[session error] ${event.message}`);
          onStatus(tab.id, "error");
        }
      },
      onClose: () => onWsConnected(tab.id, false)
    });
    connectionRef.current = conn;

    const disposable = term.onData((data) => {
      conn.sendText(data);
    });

    return () => {
      disposable.dispose();
      conn.close();
      connectionRef.current = null;
    };
  }, [port, tab.id, tab.session, onAppendOutput, onStatus, onWsConnected]);

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
        <span>
          {tab.title} · {tab.session ? `port ${tab.session.port}` : "no session"} · {tab.status}
        </span>
        <span>{tab.wsConnected ? "ws connected" : "ws disconnected"}</span>
      </div>
      <div ref={hostElRef} className="h-full min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-2" />
    </div>
  );
}
