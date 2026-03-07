import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalSessionStartupScript } from "@localterm/shared";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { errorMessage, getWidgetApi } from "./widget-api";

type TerminalWidgetState = {
  cols: number;
  rows: number;
  sessionId: string;
  port: number;
  pid: number;
  status: string;
  wsConnected: boolean;
  startupScripts: LocalSessionStartupScript[];
};

type ContextMenuState = {
  x: number;
  y: number;
} | null;

type Disposable = {
  dispose: () => void;
};

const DEFAULT_STATE: TerminalWidgetState = {
  cols: 120,
  rows: 30,
  sessionId: "",
  port: 0,
  pid: 0,
  status: "idle",
  wsConnected: false,
  startupScripts: []
};

const decoder = new TextDecoder();

function normalizeState(raw: Record<string, unknown> | null | undefined): TerminalWidgetState {
  const source = raw ?? {};
  return {
    cols: Number.isFinite(source.cols) ? Math.max(20, Math.floor(source.cols as number)) : 120,
    rows: Number.isFinite(source.rows) ? Math.max(5, Math.floor(source.rows as number)) : 30,
    sessionId: typeof source.sessionId === "string" ? source.sessionId : "",
    port: Number.isFinite(source.port) ? Math.max(0, Math.floor(source.port as number)) : 0,
    pid: Number.isFinite(source.pid) ? Math.max(0, Math.floor(source.pid as number)) : 0,
    status: typeof source.status === "string" ? source.status : "idle",
    wsConnected: source.wsConnected === true,
    startupScripts: Array.isArray(source.startupScripts)
      ? (source.startupScripts as LocalSessionStartupScript[])
      : []
  };
}

function clampContextPosition(clientX: number, clientY: number) {
  const menuWidth = 150;
  const menuHeight = 96;
  const x = Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8));
  const y = Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8));
  return { x, y };
}

export default function App() {
  const api = useMemo(() => getWidgetApi(), []);
  const [state, setState] = useState<TerminalWidgetState>(DEFAULT_STATE);
  const stateRef = useRef<TerminalWidgetState>(DEFAULT_STATE);
  const [hasSelection, setHasSelection] = useState(false);
  const [statusTip, setStatusTip] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bootstrappedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const terminalDisposablesRef = useRef<Disposable[]>([]);

  const applyState = useCallback((next: TerminalWidgetState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const appendSystemLine = useCallback((line: string) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.writeln(`\r\n${line}`);
  }, []);

  const patchState = useCallback(
    async (patch: Partial<TerminalWidgetState>) => {
      const next = normalizeState({
        ...stateRef.current,
        ...patch
      });
      applyState(next);
      await api.state.patch(patch as Record<string, unknown>);
    },
    [api, applyState]
  );

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      ws.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
  }, []);

  const writeInput = useCallback(
    async (data: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        return;
      }
      const sessionId = stateRef.current.sessionId;
      if (!sessionId) return;
      await api.terminal.write({
        sessionId,
        data
      });
    },
    [api]
  );

  const syncTerminalSize = useCallback(async () => {
    const sessionId = stateRef.current.sessionId;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !sessionId) return;

    fitAddon.fit();

    const cols = Math.max(20, terminal.cols);
    const rows = Math.max(5, terminal.rows);
    const snapshot = stateRef.current;

    if (cols === snapshot.cols && rows === snapshot.rows) return;

    try {
      await api.terminal.resize({
        sessionId,
        cols,
        rows
      });
      await patchState({ cols, rows });
    } catch (error) {
      setStatusTip(`resize failed: ${errorMessage(error)}`);
    }
  }, [api, patchState]);

  const scheduleTerminalSizeSync = useCallback(() => {
    if (resizeTimerRef.current != null) {
      window.clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      void syncTerminalSize();
    }, 80);
  }, [syncTerminalSize]);

  const connectWs = useCallback(
    (port: number) => {
      if (!port) return;
      closeWs();

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.binaryType = "arraybuffer";

      ws.addEventListener("open", () => {
        wsRef.current = ws;
        void patchState({ wsConnected: true }).catch(() => undefined);
        scheduleTerminalSizeSync();
      });

      ws.addEventListener("message", (event) => {
        const terminal = terminalRef.current;
        if (!terminal) return;

        if (typeof event.data === "string") {
          try {
            const control = JSON.parse(event.data) as {
              type?: string;
              exitCode?: number | null;
              message?: string;
            };
            if (control.type === "ready") {
              void patchState({ status: "ready" }).catch(() => undefined);
              return;
            }
            if (control.type === "exit") {
              appendSystemLine(`[session exited] code=${control.exitCode ?? "null"}`);
              void patchState({ status: "exited", wsConnected: false }).catch(() => undefined);
              return;
            }
            if (control.type === "error") {
              appendSystemLine(`[session error] ${control.message ?? "unknown"}`);
              void patchState({ status: "error", wsConnected: false }).catch(() => undefined);
              return;
            }
          } catch {
            terminal.write(event.data);
            return;
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          terminal.write(decoder.decode(event.data));
        }
      });

      ws.addEventListener("close", () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        void patchState({ wsConnected: false }).catch(() => undefined);
      });

      ws.addEventListener("error", () => {
        appendSystemLine("[websocket error]");
      });
    },
    [appendSystemLine, closeWs, patchState, scheduleTerminalSizeSync]
  );

  const ensureSession = useCallback(async () => {
    const snapshot = stateRef.current;
    const terminal = terminalRef.current;

    const wantedCols = Math.max(20, terminal?.cols ?? snapshot.cols);
    const wantedRows = Math.max(5, terminal?.rows ?? snapshot.rows);

    if (snapshot.sessionId && snapshot.port > 0) {
      try {
        const listed = await api.terminal.list();
        const matched = listed.find((entry) => entry.sessionId === snapshot.sessionId);
        if (matched) {
          await patchState({
            cols: wantedCols,
            rows: wantedRows,
            port: matched.port,
            pid: matched.pid,
            status: matched.status
          });
          connectWs(matched.port);
          return;
        }
      } catch {
        // fallback to creating a new session
      }
    }

    const created = await api.terminal.create({
      cols: wantedCols,
      rows: wantedRows,
      startupScripts: snapshot.startupScripts
    });

    await patchState({
      cols: wantedCols,
      rows: wantedRows,
      sessionId: created.sessionId,
      port: created.port,
      pid: created.pid,
      status: created.status,
      wsConnected: false
    });
    connectWs(created.port);
  }, [api, connectWs, patchState]);

  const initTerminal = useCallback(() => {
    if (terminalRef.current || !hostRef.current) return;

    const terminal = new Terminal({
      cols: stateRef.current.cols,
      rows: stateRef.current.rows,
      scrollback: 10_000,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      fontFamily: '"JetBrains Mono", "Cascadia Mono", "Fira Code", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: "#04070f",
        foreground: "#dbeafe",
        cursor: "#93c5fd",
        cursorAccent: "#0f172a",
        selectionBackground: "#1d4ed8aa",
        black: "#0b1220",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e2e8f0",
        brightBlack: "#334155",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f8fafc"
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(hostRef.current);
    fitAddon.fit();
    terminal.focus();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminalDisposablesRef.current.push(
      terminal.onData((data) => {
        void writeInput(data).catch((error) => {
          appendSystemLine(`[write error] ${errorMessage(error)}`);
        });
      }),
      terminal.onSelectionChange(() => {
        setHasSelection(terminal.hasSelection());
      })
    );

    const observer = new ResizeObserver(() => {
      scheduleTerminalSizeSync();
    });
    observer.observe(hostRef.current);
    resizeObserverRef.current = observer;
  }, [appendSystemLine, scheduleTerminalSizeSync, writeInput]);

  const handleReconnect = useCallback(async () => {
    const snapshot = stateRef.current;
    try {
      if (snapshot.port > 0) {
        connectWs(snapshot.port);
      } else {
        await ensureSession();
      }
      terminalRef.current?.focus();
    } catch (error) {
      setStatusTip(`reconnect failed: ${errorMessage(error)}`);
    }
  }, [connectWs, ensureSession]);

  const handleKill = useCallback(async () => {
    const sessionId = stateRef.current.sessionId;
    if (!sessionId) return;

    try {
      await api.terminal.kill({ sessionId });
      closeWs();
      await patchState({ status: "exited", wsConnected: false });
      appendSystemLine("[killed]");
    } catch (error) {
      setStatusTip(`kill failed: ${errorMessage(error)}`);
    }
  }, [api, appendSystemLine, closeWs, patchState]);

  const handleCopySelection = useCallback(async () => {
    const terminal = terminalRef.current;
    const selectedText = terminal?.getSelection() ?? "";
    if (!selectedText) return;

    try {
      await navigator.clipboard.writeText(selectedText);
      terminal?.clearSelection();
      setHasSelection(false);
      setStatusTip("已复制选中内容");
      terminal?.focus();
    } catch (error) {
      setStatusTip(`copy failed: ${errorMessage(error)}`);
    }
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    setContextMenu(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      await writeInput(text);
      terminalRef.current?.focus();
    } catch (error) {
      setStatusTip(`粘贴失败: ${errorMessage(error)}`);
    }
  }, [writeInput]);

  const handleClearTerminal = useCallback(() => {
    setContextMenu(null);
    terminalRef.current?.clear();
    terminalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    initTerminal();

    let disposed = false;

    const disposeState = api.state.onDidChange((nextState) => {
      if (disposed) return;
      applyState(normalizeState(nextState));
    });

    void (async () => {
      try {
        const context = await api.widget.getContext();
        if (context?.tabTitle) {
          document.title = context.tabTitle;
        }

        const stored = await api.state.get();
        if (disposed) return;
        applyState(normalizeState(stored));

        await ensureSession();
        scheduleTerminalSizeSync();
      } catch (error) {
        appendSystemLine(`[bootstrap error] ${errorMessage(error)}`);
      }
    })();

    return () => {
      disposed = true;
      disposeState();

      if (resizeTimerRef.current != null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      for (const disposable of terminalDisposablesRef.current) {
        try {
          disposable.dispose();
        } catch {
          // ignore
        }
      }
      terminalDisposablesRef.current = [];

      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;

      closeWs();
    };
  }, [api, appendSystemLine, applyState, closeWs, ensureSession, initTerminal, scheduleTerminalSizeSync]);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);

    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const wsText = state.wsConnected ? "ws connected" : "ws disconnected";
  const sessionText = state.sessionId
    ? `${state.sessionId.slice(0, 8)} · port ${state.port || "-"} · pid ${state.pid || "-"}`
    : "session: -";
  const statusText = `${state.status} · ${wsText}`;

  return (
    <main className="relative grid h-full min-h-0 grid-rows-[auto_1fr_auto] gap-2 bg-[radial-gradient(circle_at_top_left,rgba(30,58,138,0.28),rgba(2,6,23,1)_60%)] p-2 text-zinc-100">
      <header className="flex items-center justify-between gap-2 rounded-md border border-blue-900/50 bg-slate-950/75 px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 text-[11px] text-blue-200">
            extension terminal
          </span>
          <span className="truncate text-slate-300">{sessionText}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleReconnect()}
            className="h-7 rounded border border-slate-700 bg-slate-900 px-2.5 text-[11px] text-slate-100 hover:border-sky-500"
          >
            Reconnect
          </button>
          <button
            type="button"
            onClick={() => void handleKill()}
            className="h-7 rounded border border-red-900 bg-red-950 px-2.5 text-[11px] text-red-100 hover:border-red-700"
          >
            Kill
          </button>
        </div>
      </header>

      <section className="relative min-h-0 overflow-hidden rounded-md border border-slate-800 bg-[#04070f] shadow-[0_0_0_1px_rgba(96,165,250,0.08),0_10px_30px_rgba(2,6,23,0.45)]">
        <div
          ref={hostRef}
          className="terminal-host h-full w-full"
          onContextMenu={(event) => {
            event.preventDefault();
            const position = clampContextPosition(event.clientX, event.clientY);
            setContextMenu(position);
            terminalRef.current?.focus();
          }}
        />

        {hasSelection ? (
          <button
            type="button"
            onClick={() => void handleCopySelection()}
            className="absolute right-3 top-3 z-20 rounded border border-emerald-500/50 bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-100 backdrop-blur hover:bg-emerald-500/30"
          >
            复制
          </button>
        ) : null}
      </section>

      <footer className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/75 px-3 py-1.5 text-[11px] text-slate-300">
        <span>{statusText}</span>
        <span className="truncate text-slate-400">{statusTip || "右键菜单：粘贴 / 清空"}</span>
      </footer>

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-[140px] overflow-hidden rounded-md border border-slate-700 bg-slate-900/95 p-1 text-xs text-slate-100 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="flex h-8 w-full items-center rounded px-2 text-left hover:bg-slate-800"
            onClick={() => {
              void handlePasteFromClipboard();
            }}
          >
            粘贴
          </button>
          <button
            type="button"
            className="flex h-8 w-full items-center rounded px-2 text-left hover:bg-slate-800"
            onClick={handleClearTerminal}
          >
            清空
          </button>
        </div>
      ) : null}
    </main>
  );
}
