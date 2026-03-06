/**
 * Preload bridges a safe, minimal API to renderer.
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type ExtensionHostConfig,
  type SystemMetricsResponse,
  type CreateLocalSessionRequest,
  type KillSessionRequest,
  type ResizeSessionRequest,
  type WorkspaceIdRequest,
  type WorkspaceGetDefaultResponse,
  type WorkspaceListResponse,
  type WorkspaceSnapshot,
  type FsPickDirectoryResponse,
  type FsPickFileRequest,
  type FsPickFileResponse,
  type FsReadDirRequest,
  type FsReadDirResponse,
  type FsReadFileRequest,
  type FsReadFileResponse
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
  },
  system: {
    getMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.systemMetrics) as Promise<SystemMetricsResponse>
  },
  workspace: {
    save: (payload: WorkspaceSnapshot) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSave, payload),
    load: (payload: WorkspaceIdRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceLoad, payload) as Promise<WorkspaceSnapshot>,
    list: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceList) as Promise<WorkspaceListResponse>,
    close: (payload: WorkspaceIdRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceClose, payload),
    delete: (payload: WorkspaceIdRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDelete, payload),
    getDefault: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetDefault) as Promise<WorkspaceGetDefaultResponse>
  },
  file: {
    pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.filePickDirectory) as Promise<FsPickDirectoryResponse>,
    pickFile: (payload?: FsPickFileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.filePickFile, payload ?? {}) as Promise<FsPickFileResponse>,
    readDir: (payload: FsReadDirRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.fileReadDir, payload) as Promise<FsReadDirResponse>,
    readFile: (payload: FsReadFileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.fileReadFile, payload) as Promise<FsReadFileResponse>
  },
  extension: {
    getHostConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.extensionGetHostConfig) as Promise<ExtensionHostConfig>
  }
};

contextBridge.exposeInMainWorld("localtermApi", api);

export type LocaltermPreloadApi = typeof api;
