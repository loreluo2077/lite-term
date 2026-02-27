/**
 * TerminalPane should remain session-type agnostic.
 * local/ssh differences are injected via session metadata.
 */
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import type { TabRecord } from "../lib/atoms/session";
import { connectSessionWebSocket } from "../lib/session/connect-session-ws";
import {
  loadCanvasAddon,
  loadFitAddon,
  loadLigaturesAddon,
  loadSearchAddon,
  loadTerminal,
  loadUnicode11Addon,
  loadWebLinksAddon,
  loadWebglAddon
} from "../lib/xterm/xterm-loader";

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
  const searchRef = useRef<SearchAddon | null>(null);
  const hostElRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const port = tab.session?.port;

  useEffect(() => {
    if (!hostElRef.current || xtermRef.current) return;
    let cancelled = false;
    let focusTerm: (() => void) | null = null;

    void (async () => {
      const [
        TerminalCtor,
        FitAddonCtor,
        SearchAddonCtor,
        WebLinksAddonCtor,
        Unicode11AddonCtor,
        LigaturesAddonCtor
      ] = await Promise.all([
        loadTerminal(),
        loadFitAddon(),
        loadSearchAddon(),
        loadWebLinksAddon(),
        loadUnicode11Addon(),
        loadLigaturesAddon()
      ]);

      if (cancelled || !hostElRef.current) return;

      const term = new TerminalCtor({
        allowProposedApi: true,
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
      const fit = new FitAddonCtor();
      const search = new SearchAddonCtor();

      term.open(hostElRef.current);

      // electerm supports webgl/canvas renderer fallback; preserve that behavior.
      try {
        const WebglAddonCtor = await loadWebglAddon();
        if (!cancelled) term.loadAddon(new WebglAddonCtor());
      } catch {
        try {
          const CanvasAddonCtor = await loadCanvasAddon();
          if (!cancelled) term.loadAddon(new CanvasAddonCtor());
        } catch {
          // xterm DOM renderer fallback is acceptable in phase 1
        }
      }

      if (cancelled) {
        term.dispose();
        return;
      }

      try {
        const unicode11 = new Unicode11AddonCtor();
        term.loadAddon(unicode11);
        term.unicode.activeVersion = "11";
      } catch {
        // keep default unicode width table if addon fails
      }

      try {
        term.loadAddon(new LigaturesAddonCtor());
      } catch {
        // ligatures are visual enhancement only
      }

      term.loadAddon(fit);
      term.loadAddon(search);
      term.loadAddon(new WebLinksAddonCtor((event: MouseEvent, uri: string) => {
        event.preventDefault();
        window.open(uri, "_blank", "noopener,noreferrer");
      }));

      fit.fit();
      term.focus();
      term.writeln("localterm: session pane initialized");
      term.writeln("");
      if (tab.output) {
        term.write(tab.output);
      }

      xtermRef.current = term;
      fitRef.current = fit;
      searchRef.current = search;
      setTerminalReady(true);

      focusTerm = () => term.focus();
      hostElRef.current?.addEventListener("mousedown", focusTerm);

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
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      onStatus(tab.id, "error");
      onAppendOutput(tab.id, `\n[xterm init error] ${message}\n`);
    });

    return () => {
      cancelled = true;
      setTerminalReady(false);
      if (focusTerm) {
        hostElRef.current?.removeEventListener("mousedown", focusTerm);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      fitRef.current?.dispose();
      searchRef.current?.dispose();
      xtermRef.current?.dispose();
      searchRef.current = null;
      fitRef.current = null;
      xtermRef.current = null;
    };
  }, [tab.id, tab.session?.sessionId, onAppendOutput, onStatus]);

  useEffect(() => {
    if (!port) return;
    if (!terminalReady) return;
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;

    const conn = connectSessionWebSocket(port, {
      onOpen: () => {
        onWsConnected(tab.id, true);
        term.focus();
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
    const binaryDisposable = term.onBinary((data) => {
      conn.sendText(data);
    });

    return () => {
      binaryDisposable.dispose();
      disposable.dispose();
      conn.close();
      connectionRef.current = null;
    };
  }, [port, tab.id, tab.session, terminalReady, onAppendOutput, onStatus, onWsConnected]);

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
