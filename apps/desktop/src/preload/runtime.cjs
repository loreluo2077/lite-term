const { contextBridge, ipcRenderer } = require("electron");

const api = {
  session: {
    createLocalSession: (payload) => ipcRenderer.invoke("session:createLocal", payload),
    resizeSession: (payload) => ipcRenderer.invoke("session:resize", payload),
    killSession: (payload) => ipcRenderer.invoke("session:kill", payload),
    listSessions: () => ipcRenderer.invoke("session:list")
  }
};

contextBridge.exposeInMainWorld("localtermApi", api);

