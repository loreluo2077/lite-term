/**
 * Preload bridges a safe, minimal API to renderer.
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type ExtensionHostConfig,
  type SystemMetricsResponse,
  type SystemNotifyRequest,
  type CreateLocalSessionRequest,
  type KillSessionRequest,
  type ResizeSessionRequest,
  type WorkspaceIdRequest,
  type WorkspaceGetDefaultResponse,
  type WorkspaceGlobalLibraryGetRequest,
  type WorkspaceGlobalLibraryGetResponse,
  type WorkspaceGlobalLibrarySetRequest,
  type WorkspaceListResponse,
  type WorkspaceStorageInfoResponse,
  type WorkspaceSnapshot,
  type WidgetRegistrySnapshot,
  type ApiGatewayConfig,
  type ApiGatewaySaveConfigRequest,
  type ApiGatewayStatus,
  type ApiGatewayCheckProviderHealthRequest,
  type ApiGatewayCheckProviderHealthResponse,
  type FsPickDirectoryResponse,
  type FsPickFileRequest,
  type FsPickFileResponse,
  type FsReadDirRequest,
  type FsReadDirResponse,
  type FsReadFileRequest,
  type FsReadFileResponse,
  type AgentConfigListRequest,
  type AgentConfigListResponse,
  type AgentConfigReadFileRequest,
  type AgentConfigReadFileResponse,
  type AgentConfigRevealPathRequest,
  type AgentConfigWriteFileRequest,
  type GitReadDiffRequest,
  type GitReadDiffResponse
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
    getMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.systemMetrics) as Promise<SystemMetricsResponse>,
    notify: (payload: SystemNotifyRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.systemNotify, payload)
  },
  workspace: {
    save: (payload: WorkspaceSnapshot) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSave, payload),
    load: (payload: WorkspaceIdRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceLoad, payload) as Promise<WorkspaceSnapshot>,
    list: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceList) as Promise<WorkspaceListResponse>,
    close: (payload: WorkspaceIdRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceClose, payload),
    delete: (payload: WorkspaceIdRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDelete, payload),
    getDefault: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetDefault) as Promise<WorkspaceGetDefaultResponse>,
    getGlobalLibrary: (payload: WorkspaceGlobalLibraryGetRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGlobalLibraryGet, payload) as Promise<WorkspaceGlobalLibraryGetResponse>,
    setGlobalLibrary: (payload: WorkspaceGlobalLibrarySetRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGlobalLibrarySet, payload),
    removeGlobalLibrary: (payload: WorkspaceGlobalLibraryGetRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGlobalLibraryRemove, payload),
    getStorageInfo: () =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceStorageInfo) as Promise<WorkspaceStorageInfoResponse>
  },
  gateway: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.apiGatewayGetConfig) as Promise<ApiGatewayConfig>,
    saveConfig: (payload: ApiGatewaySaveConfigRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.apiGatewaySaveConfig, payload) as Promise<ApiGatewayConfig>,
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.apiGatewayGetStatus) as Promise<ApiGatewayStatus>,
    start: () => ipcRenderer.invoke(IPC_CHANNELS.apiGatewayStart) as Promise<ApiGatewayStatus>,
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.apiGatewayStop) as Promise<ApiGatewayStatus>,
    checkProviderHealth: (payload: ApiGatewayCheckProviderHealthRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.apiGatewayCheckProviderHealth, payload) as Promise<ApiGatewayCheckProviderHealthResponse>
  },
  widgetRegistry: {
    save: (payload: WidgetRegistrySnapshot) =>
      ipcRenderer.invoke(IPC_CHANNELS.widgetRegistrySave, payload),
    load: () => ipcRenderer.invoke(IPC_CHANNELS.widgetRegistryLoad) as Promise<WidgetRegistrySnapshot>
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
  agentConfigs: {
    list: (payload: AgentConfigListRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentConfigsList, payload) as Promise<AgentConfigListResponse>,
    readFile: (payload: AgentConfigReadFileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentConfigsReadFile, payload) as Promise<AgentConfigReadFileResponse>,
    writeFile: (payload: AgentConfigWriteFileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentConfigsWriteFile, payload),
    revealPath: (payload: AgentConfigRevealPathRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentConfigsRevealPath, payload)
  },
  git: {
    readDiff: (payload: GitReadDiffRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.gitReadDiff, payload) as Promise<GitReadDiffResponse>
  },
  extension: {
    getHostConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.extensionGetHostConfig) as Promise<ExtensionHostConfig>
  }
};

contextBridge.exposeInMainWorld("localtermApi", api);

export type LocaltermPreloadApi = typeof api;
