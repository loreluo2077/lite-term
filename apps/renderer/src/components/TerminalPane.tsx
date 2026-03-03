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
  isActive: boolean;
  onTraffic: (tabId: string, bytes: number, lines: number) => void;
  onCommandChannel: (tabId: string, send: ((text: string) => void) | null) => void;
  onSessionReady: (tabId: string) => void;
  onStatus: (tabId: string, status: TabRecord["status"]) => void;
  onWsConnected: (tabId: string, connected: boolean) => void;
};

export function TerminalPane({
  tab,
  isActive,
  onTraffic,
  onCommandChannel,
  onSessionReady,
  onStatus,
  onWsConnected
}: Props) {
  const connectionRef = useRef<ReturnType<typeof connectSessionWebSocket> | null>(null);
  const connectionGenerationRef = useRef(0);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const encoderRef = useRef(new TextEncoder());
  const isActiveRef = useRef(isActive);
  const hostElRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [reconnectToken, setReconnectToken] = useState(0);
  const port = tab.session?.port;

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

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
      if (isActive) term.focus();

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
      const term = xtermRef.current;
      if (term) {
        term.writeln(`\r\n[xterm init error] ${message}`);
      }
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
  }, [tab.id, tab.session?.sessionId, onStatus]);

  useEffect(() => {
    if (!isActive) return;
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
      term.focus();
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
  }, [isActive, tab.session?.sessionId]);

  useEffect(() => {
    console.log(`[TerminalPane] WS connect effect triggered - tabId=${tab.id.slice(0, 8)}, port=${port}, terminalReady=${terminalReady}, status=${tab.status}, hasTermRef=${!!xtermRef.current}, hasFitRef=${!!fitRef.current}`);

    if (!port) {
      console.log(`[TerminalPane] Skipping WS connect - no port yet (tabId=${tab.id.slice(0, 8)})`);
      return;
    }
    if (!terminalReady) {
      console.log(`[TerminalPane] Skipping WS connect - terminal not ready yet (tabId=${tab.id.slice(0, 8)})`);
      return;
    }
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (!term || !fit) {
      console.log(`[TerminalPane] Skipping WS connect - term or fit not available (tabId=${tab.id.slice(0, 8)}), will retry in 100ms`);
      // Race condition: terminalReady was set but refs not yet assigned
      // This can happen if React hasn't re-rendered yet or async init is still pending
      // Schedule a retry by bumping reconnectToken
      const retryTimer = setTimeout(() => {
        console.log(`[TerminalPane] Retrying WS connect for tabId=${tab.id.slice(0, 8)}`);
        setReconnectToken((x) => x + 1);
      }, 100);
      return () => clearTimeout(retryTimer);
    }
    const generation = connectionGenerationRef.current + 1;
    connectionGenerationRef.current = generation;
    let closedByEffectCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    console.log(`[TerminalPane] Connecting WebSocket to port ${port} (tabId=${tab.id.slice(0, 8)}, generation=${generation})`);
    const conn = connectSessionWebSocket(port, {
      onOpen: () => {
        if (generation !== connectionGenerationRef.current) return;
        onWsConnected(tab.id, true);
        onCommandChannel(tab.id, (text: string) => conn.sendText(text));
        if (isActiveRef.current) term.focus();
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
        if (generation !== connectionGenerationRef.current) return;
        term.write(text);
        onTraffic(
          tab.id,
          encoderRef.current.encode(text).byteLength,
          text.split("\n").length - 1
        );
      },
      onControlEvent: (event) => {
        if (generation !== connectionGenerationRef.current) return;
        if (event.type === "ready") {
          onStatus(tab.id, "ready");
          onSessionReady(tab.id);
        }
        if (event.type === "exit") {
          term.writeln(`\r\n[session exited] code=${event.exitCode ?? "null"}`);
          onStatus(tab.id, "exited");
        }
        if (event.type === "error") {
          term.writeln(`\r\n[session error] ${event.message}`);
          onStatus(tab.id, "error");
        }
      },
      onClose: () => {
        if (generation !== connectionGenerationRef.current) return;
        onWsConnected(tab.id, false);
        onCommandChannel(tab.id, null);
        if (!closedByEffectCleanup && tab.status !== "exited" && tab.status !== "error") {
          reconnectTimer = setTimeout(() => {
            setReconnectToken((x) => x + 1);
          }, 350);
        }
      }
    });
    connectionRef.current = conn;

    const disposable = term.onData((data) => {
      conn.sendText(data);
    });
    const binaryDisposable = term.onBinary((data) => {
      conn.sendText(data);
    });

    return () => {
      console.log(`[TerminalPane] Cleaning up WS connection for tabId=${tab.id.slice(0, 8)}, port=${port}, generation=${generation}`);
      closedByEffectCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      binaryDisposable.dispose();
      disposable.dispose();
      conn.close();
      if (generation === connectionGenerationRef.current) {
        onCommandChannel(tab.id, null);
      }
      connectionRef.current = null;
    };
    // CRITICAL: Only depend on values that should trigger a NEW connection
    // Do NOT include callbacks (onCommandChannel, onTraffic, etc.) as they change on every render
    // causing the effect to re-run and close/reopen the connection unnecessarily
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    port,
    terminalReady,
    reconnectToken,
    tab.id
    // Deliberately NOT including: onCommandChannel, onTraffic, onStatus, onWsConnected, tab.session?.sessionId, tab.status
    // These callbacks/values are used but should NOT trigger reconnection
  ]);

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
