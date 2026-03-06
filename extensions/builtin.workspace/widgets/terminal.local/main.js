const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const sessionEl = document.getElementById("session");
const formEl = document.getElementById("input-form");
const inputEl = document.getElementById("input");
const colsEl = document.getElementById("cols");
const rowsEl = document.getElementById("rows");
const btnResize = document.getElementById("btn-resize");
const btnReconnect = document.getElementById("btn-reconnect");
const btnKill = document.getElementById("btn-kill");

const decoder = new TextDecoder();
let ws = null;
let state = normalizeState({});

function normalizeState(raw) {
  return {
    cols: Number.isFinite(raw?.cols) ? Math.max(20, Math.floor(raw.cols)) : 120,
    rows: Number.isFinite(raw?.rows) ? Math.max(5, Math.floor(raw.rows)) : 30,
    sessionId: typeof raw?.sessionId === "string" ? raw.sessionId : "",
    port: Number.isFinite(raw?.port) ? Math.max(0, Math.floor(raw.port)) : 0,
    pid: Number.isFinite(raw?.pid) ? Math.max(0, Math.floor(raw.pid)) : 0,
    status: typeof raw?.status === "string" ? raw.status : "idle",
    wsConnected: raw?.wsConnected === true,
    startupScripts: Array.isArray(raw?.startupScripts) ? raw.startupScripts : []
  };
}

function appendOutput(text) {
  const limit = 200000;
  outputEl.textContent += text;
  if (outputEl.textContent.length > limit) {
    outputEl.textContent = outputEl.textContent.slice(outputEl.textContent.length - limit);
  }
  outputEl.scrollTop = outputEl.scrollHeight;
}

function render() {
  colsEl.value = String(state.cols);
  rowsEl.value = String(state.rows);
  statusEl.textContent = state.wsConnected
    ? `${state.status} · ws connected`
    : `${state.status} · ws disconnected`;
  sessionEl.textContent = state.sessionId
    ? `session: ${state.sessionId.slice(0, 8)} · port ${state.port || "-"}`
    : "session: -";
}

async function patchState(patch) {
  state = normalizeState({
    ...state,
    ...patch
  });
  await window.widgetApi.state.patch(patch);
  render();
}

function closeWs() {
  if (!ws) return;
  try {
    ws.close();
  } catch {
    // ignore
  }
  ws = null;
}

function connectWs(port) {
  if (!port) return;
  closeWs();

  const nextWs = new WebSocket(`ws://127.0.0.1:${port}`);
  nextWs.binaryType = "arraybuffer";

  nextWs.addEventListener("open", () => {
    ws = nextWs;
    void patchState({ wsConnected: true }).catch(() => undefined);
  });

  nextWs.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      try {
        const control = JSON.parse(event.data);
        if (control?.type === "ready") {
          void patchState({ status: "ready" }).catch(() => undefined);
          return;
        }
        if (control?.type === "exit") {
          appendOutput(`\n[session exited] code=${control.exitCode ?? "null"}\n`);
          void patchState({ status: "exited", wsConnected: false }).catch(() => undefined);
          return;
        }
        if (control?.type === "error") {
          appendOutput(`\n[session error] ${control.message ?? "unknown"}\n`);
          void patchState({ status: "error", wsConnected: false }).catch(() => undefined);
          return;
        }
      } catch {
        appendOutput(event.data);
        return;
      }
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      appendOutput(decoder.decode(event.data));
    }
  });

  nextWs.addEventListener("close", () => {
    if (ws === nextWs) ws = null;
    void patchState({ wsConnected: false }).catch(() => undefined);
  });

  nextWs.addEventListener("error", () => {
    appendOutput("\n[websocket error]\n");
  });
}

async function ensureSession() {
  if (state.sessionId && state.port > 0) {
    try {
      const sessions = await window.widgetApi.terminal.list();
      const listed = Array.isArray(sessions)
        ? sessions.find((entry) => entry?.sessionId === state.sessionId)
        : null;
      if (listed) {
        await patchState({
          port: listed.port,
          pid: listed.pid,
          status: listed.status
        });
        connectWs(listed.port);
        return;
      }
    } catch {
      // fallback to create a new session
    }
  }

  const created = await window.widgetApi.terminal.create({
    cols: state.cols,
    rows: state.rows,
    startupScripts: state.startupScripts
  });
  await patchState({
    sessionId: created.sessionId,
    port: created.port,
    pid: created.pid,
    status: created.status,
    wsConnected: false
  });
  connectWs(created.port);
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = inputEl.value;
  if (!value.trim()) return;

  const payload = value.endsWith("\n") ? value : `${value}\n`;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  } else if (state.sessionId) {
    await window.widgetApi.terminal.write({
      sessionId: state.sessionId,
      data: payload
    });
  }
  inputEl.value = "";
});

btnResize.addEventListener("click", async () => {
  if (!state.sessionId) return;
  const cols = Math.max(20, Math.floor(Number(colsEl.value) || 120));
  const rows = Math.max(5, Math.floor(Number(rowsEl.value) || 30));
  await window.widgetApi.terminal.resize({
    sessionId: state.sessionId,
    cols,
    rows
  });
  await patchState({ cols, rows });
});

btnReconnect.addEventListener("click", async () => {
  if (state.port > 0) {
    connectWs(state.port);
    return;
  }
  await ensureSession();
});

btnKill.addEventListener("click", async () => {
  if (!state.sessionId) return;
  await window.widgetApi.terminal.kill({
    sessionId: state.sessionId
  });
  closeWs();
  await patchState({
    status: "exited",
    wsConnected: false
  });
  appendOutput("\n[killed]\n");
});

window.widgetApi.state.onDidChange((nextState) => {
  state = normalizeState(nextState);
  render();
});

async function bootstrap() {
  const context = await window.widgetApi.widget.getContext();
  if (context?.tabTitle) {
    document.title = context.tabTitle;
  }

  const stored = await window.widgetApi.state.get();
  state = normalizeState(stored);
  render();
  await ensureSession();
}

void bootstrap().catch((error) => {
  appendOutput(`\n[bootstrap error] ${error instanceof Error ? error.message : String(error)}\n`);
});
