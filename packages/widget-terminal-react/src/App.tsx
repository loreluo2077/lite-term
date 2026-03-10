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

type BootPhase =
  | "starting-session"
  | "connecting-socket"
  | "waiting-shell"
  | "running-startup"
  | "ready"
  | "error"
  | "exited";

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

function phaseProgress(phase: BootPhase) {
  switch (phase) {
    case "starting-session":
      return 16;
    case "connecting-socket":
      return 38;
    case "waiting-shell":
      return 68;
    case "running-startup":
      return 88;
    case "ready":
      return 100;
    case "error":
      return 100;
    case "exited":
      return 100;
  }
}

function phaseLabel(phase: BootPhase) {
  switch (phase) {
    case "starting-session":
      return "Starting session";
    case "connecting-socket":
      return "Connecting terminal";
    case "waiting-shell":
      return "Waiting for shell prompt";
    case "running-startup":
      return "Running startup scripts";
    case "ready":
      return "Terminal ready";
    case "error":
      return "Terminal error";
    case "exited":
      return "Terminal exited";
  }
}

function phaseHint(phase: BootPhase, hasStartupScripts: boolean) {
  switch (phase) {
    case "starting-session":
      return "Creating worker and PTY session";
    case "connecting-socket":
      return "Attaching web terminal transport";
    case "waiting-shell":
      return hasStartupScripts ? "Waiting until shell prompt is visible before boot scripts" : "Waiting until shell prompt is visible";
    case "running-startup":
      return "Boot commands are queued after shell ready";
    case "ready":
      return hasStartupScripts ? "Shell and startup scripts completed" : "Shell prompt detected";
    case "error":
      return "Check terminal output for details";
    case "exited":
      return "Session closed";
  }
}

export default function App() {
  const api = useMemo(() => getWidgetApi(), []);
  const [, setState] = useState<TerminalWidgetState>(DEFAULT_STATE);
  const stateRef = useRef<TerminalWidgetState>(DEFAULT_STATE);
  const [hasSelection, setHasSelection] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [bootPhase, setBootPhase] = useState<BootPhase>("starting-session");
  const [progressVisible, setProgressVisible] = useState(true);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bootstrappedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const terminalDisposablesRef = useRef<Disposable[]>([]);
  const readyHideTimerRef = useRef<number | null>(null);

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

  const clearReadyHideTimer = useCallback(() => {
    if (readyHideTimerRef.current != null) {
      window.clearTimeout(readyHideTimerRef.current);
      readyHideTimerRef.current = null;
    }
  }, []);

  const transitionBootPhase = useCallback(
    (next: BootPhase) => {
      clearReadyHideTimer();
      setBootPhase(next);
      setProgressVisible(true);
      if (next === "ready") {
        readyHideTimerRef.current = window.setTimeout(() => {
          setProgressVisible(false);
          readyHideTimerRef.current = null;
        }, 1400);
      }
    },
    [clearReadyHideTimer]
  );

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
      appendSystemLine(`[resize failed] ${errorMessage(error)}`);
    }
  }, [api, appendSystemLine, patchState]);

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
      transitionBootPhase("connecting-socket");

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.binaryType = "arraybuffer";

      ws.addEventListener("open", () => {
        wsRef.current = ws;
        void patchState({ wsConnected: true }).catch(() => undefined);
        transitionBootPhase("waiting-shell");
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
              detectedBy?: "prompt" | "fallback";
            };
            if (control.type === "ready") {
              void patchState({ status: "ready" }).catch(() => undefined);
              return;
            }
            if (control.type === "exit") {
              appendSystemLine(`[session exited] code=${control.exitCode ?? "null"}`);
              void patchState({ status: "exited", wsConnected: false }).catch(() => undefined);
              transitionBootPhase("exited");
              return;
            }
            if (control.type === "error") {
              appendSystemLine(`[session error] ${control.message ?? "unknown"}`);
              void patchState({ status: "error", wsConnected: false }).catch(() => undefined);
              transitionBootPhase("error");
              return;
            }
            if (control.type === "startup-scripts-error") {
              appendSystemLine(`[startup scripts error] ${control.message ?? "unknown"}`);
              transitionBootPhase("error");
              return;
            }
            if (control.type === "shell-ready") {
              if (stateRef.current.startupScripts.length === 0) {
                transitionBootPhase("ready");
              } else {
                transitionBootPhase("waiting-shell");
              }
              return;
            }
            if (control.type === "startup-scripts-started") {
              transitionBootPhase("running-startup");
              if (control.detectedBy === "fallback") {
                appendSystemLine("[startup scripts] prompt not detected, fallback run");
              }
              return;
            }
            if (control.type === "startup-scripts-complete") {
              transitionBootPhase("ready");
              return;
            }
          } catch {
            terminal.write(event.data);
            return;
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          const text = decoder.decode(event.data);
          terminal.write(text);
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
        transitionBootPhase("error");
      });
    },
    [appendSystemLine, closeWs, patchState, scheduleTerminalSizeSync, transitionBootPhase]
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

    transitionBootPhase("starting-session");
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
  }, [api, connectWs, patchState, transitionBootPhase]);

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

  const handleCopySelection = useCallback(async () => {
    const terminal = terminalRef.current;
    const selectedText = terminal?.getSelection() ?? "";
    if (!selectedText) return;

    try {
      await navigator.clipboard.writeText(selectedText);
      terminal?.clearSelection();
      setHasSelection(false);
      terminal?.focus();
    } catch (error) {
      appendSystemLine(`[copy failed] ${errorMessage(error)}`);
    }
  }, [appendSystemLine]);

  const handlePasteFromClipboard = useCallback(async () => {
    setContextMenu(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      await writeInput(text);
      terminalRef.current?.focus();
    } catch (error) {
      appendSystemLine(`[paste failed] ${errorMessage(error)}`);
    }
  }, [appendSystemLine, writeInput]);

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

      clearReadyHideTimer();
      closeWs();
    };
  }, [api, appendSystemLine, applyState, clearReadyHideTimer, closeWs, ensureSession, initTerminal, scheduleTerminalSizeSync]);

  const progress = phaseProgress(bootPhase);
  const progressSteps = [
    { key: "starting-session", label: "Session" },
    { key: "connecting-socket", label: "Socket" },
    { key: "waiting-shell", label: "Shell" },
    { key: "running-startup", label: "Scripts" },
    { key: "ready", label: "Ready" }
  ] as const;
  const stepIndex = progressSteps.findIndex((entry) => entry.key === bootPhase);
  const activeStepIndex = stepIndex >= 0 ? stepIndex : bootPhase === "error" || bootPhase === "exited" ? 4 : 0;
  const hasStartupScripts = stateRef.current.startupScripts.length > 0;

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

  return (
    <main className="relative h-full min-h-0 bg-[radial-gradient(circle_at_top_left,rgba(30,58,138,0.22),rgba(2,6,23,1)_60%)] p-1.5 text-zinc-100">
      <section className="relative h-full min-h-0 overflow-hidden rounded-md bg-[#04070f] shadow-[0_8px_24px_rgba(2,6,23,0.4)]">
        {progressVisible ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 rounded-xl border border-slate-800/80 bg-slate-950/88 px-3 py-2 shadow-[0_12px_28px_rgba(2,6,23,0.35)] backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <span>{phaseLabel(bootPhase)}</span>
              <span className="font-semibold text-slate-200">{progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  bootPhase === "error"
                    ? "bg-rose-500"
                    : bootPhase === "exited"
                      ? "bg-amber-400"
                      : "bg-[linear-gradient(90deg,#38bdf8_0%,#60a5fa_55%,#34d399_100%)]"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {progressSteps.map((step, index) => {
                const active = index <= activeStepIndex;
                const muted = step.key === "running-startup" && !hasStartupScripts;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-1.5 text-[10px] ${
                      active ? "text-slate-100" : "text-slate-500"
                    } ${muted ? "opacity-45" : ""}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active ? "bg-sky-400" : "bg-slate-700"
                      }`}
                    />
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{phaseHint(bootPhase, hasStartupScripts)}</div>
          </div>
        ) : null}
        <div
          ref={hostRef}
          className={`terminal-host h-full w-full ${progressVisible ? "pt-20" : ""}`}
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
