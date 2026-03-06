const { contextBridge, ipcRenderer } = require("electron");

let sequence = 0;
const pending = new Map();
const stateListeners = new Set();

function nextRequestId() {
  sequence += 1;
  return `widget-${Date.now().toString(36)}-${sequence}`;
}

function callHost(method, params) {
  const requestId = nextRequestId();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    ipcRenderer.sendToHost("widget-api-request", {
      requestId,
      method,
      params
    });
  });
}

ipcRenderer.on("widget-api-response", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;
  const { requestId, ok, result, error } = payload;
  if (typeof requestId !== "string") return;
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);
  if (ok) {
    entry.resolve(result);
    return;
  }
  entry.reject(
    Object.assign(new Error(error?.message || "widget api request failed"), {
      code: error?.code || "WIDGET_API_ERROR"
    })
  );
});

ipcRenderer.on("widget-host-event", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;
  if (payload.topic !== "state.changed") return;
  for (const listener of stateListeners) {
    try {
      listener(payload.state ?? {});
    } catch {
      // ignore listener errors
    }
  }
});

const widgetApi = {
  apiVersion: "1.0",
  widget: {
    getContext: () => callHost("widget.getContext"),
    setTitle: (title) => callHost("widget.setTitle", { title }),
    openWidget: (request) => callHost("widget.openWidget", request)
  },
  state: {
    get: () => callHost("state.get"),
    set: (next) => callHost("state.set", { state: next }),
    patch: (partial) => callHost("state.patch", { state: partial }),
    onDidChange: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    }
  },
  workspace: {
    getCurrent: () => callHost("workspace.getCurrent"),
    listTabs: () => callHost("workspace.listTabs"),
    activateTab: (tabId) => callHost("workspace.activateTab", { tabId })
  },
  fs: {
    pickDirectory: () => callHost("fs.pickDirectory"),
    pickFile: (payload) => callHost("fs.pickFile", payload || {}),
    readDir: (payload) => callHost("fs.readDir", payload),
    readFile: (payload) => callHost("fs.readFile", payload)
  },
  terminal: {
    create: (payload) => callHost("terminal.create", payload),
    write: (payload) => callHost("terminal.write", payload),
    resize: (payload) => callHost("terminal.resize", payload),
    kill: (payload) => callHost("terminal.kill", payload),
    list: () => callHost("terminal.list")
  }
};

contextBridge.exposeInMainWorld("widgetApi", widgetApi);
