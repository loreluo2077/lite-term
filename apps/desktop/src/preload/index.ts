/**
 * Preload bridges a safe, minimal API to renderer.
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type CreateLocalSessionRequest,
  type KillSessionRequest,
  type ResizeSessionRequest
} from "@localterm/shared";

const api = {
  session: {
    createLocalSession: (payload: CreateLocalSessionRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionCreateLocal, payload),
    resizeSession: (payload: ResizeSessionRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionResize, payload),
    killSession: (payload: KillSessionRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionKill, payload),
    listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.sessionList)
  }
};

contextBridge.exposeInMainWorld("localtermApi", api);

export type LocaltermPreloadApi = typeof api;
