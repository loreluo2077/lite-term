const { contextBridge, ipcRenderer } = require("electron");

const api = {
  session: {
    createLocalSession: (payload) => ipcRenderer.invoke("session:createLocal", payload),
    resizeSession: (payload) => ipcRenderer.invoke("session:resize", payload),
    killSession: (payload) => ipcRenderer.invoke("session:kill", payload),
    listSessions: () => ipcRenderer.invoke("session:list")
  },
  system: {
    getMetrics: () => ipcRenderer.invoke("system:getMetrics")
  },
  workspace: {
    save: (payload) => ipcRenderer.invoke("workspace:save", payload),
    load: (payload) => ipcRenderer.invoke("workspace:load", payload),
    list: () => ipcRenderer.invoke("workspace:list"),
    close: (payload) => ipcRenderer.invoke("workspace:close", payload),
    delete: (payload) => ipcRenderer.invoke("workspace:delete", payload),
    getDefault: () => ipcRenderer.invoke("workspace:getDefault")
  },
  file: {
    pickDirectory: () => ipcRenderer.invoke("file:pickDirectory"),
    pickFile: (payload) => ipcRenderer.invoke("file:pickFile", payload ?? {}),
    readDir: (payload) => ipcRenderer.invoke("file:readDir", payload),
    readFile: (payload) => ipcRenderer.invoke("file:readFile", payload)
  }
};

contextBridge.exposeInMainWorld("localtermApi", api);
