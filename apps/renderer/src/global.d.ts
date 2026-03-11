import type * as React from "react";
import type {
  CreateLocalSessionRequest,
  CreateLocalSessionResponse,
  ExtensionHostConfig,
  KillSessionRequest,
  ListSessionsResponse,
  OkResponse,
  ResizeSessionRequest,
  SystemMetricsResponse,
  SystemNotifyRequest,
  WorkspaceGetDefaultResponse,
  WorkspaceGlobalLibraryGetRequest,
  WorkspaceGlobalLibraryGetResponse,
  WorkspaceGlobalLibrarySetRequest,
  WorkspaceIdRequest,
  WorkspaceListResponse,
  WorkspaceStorageInfoResponse,
  WorkspaceSnapshot,
  WidgetRegistrySnapshot,
  ApiGatewayConfig,
  ApiGatewaySaveConfigRequest,
  ApiGatewayStatus,
  ApiGatewayCheckProviderHealthRequest,
  ApiGatewayCheckProviderHealthResponse,
  FsPickDirectoryResponse,
  FsPickFileRequest,
  FsPickFileResponse,
  AgentConfigListRequest,
  AgentConfigListResponse,
  AgentConfigReadFileRequest,
  AgentConfigReadFileResponse,
  AgentConfigRevealPathRequest,
  AgentConfigWriteFileRequest,
  GitReadDiffRequest,
  GitReadDiffResponse,
  FsReadDirRequest,
  FsReadDirResponse,
  FsReadFileRequest,
  FsReadFileResponse
} from "@localterm/shared";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        preload?: string;
      };
    }
  }

  interface Window {
    localtermApi: {
      session: {
        createLocalSession(payload: CreateLocalSessionRequest): Promise<CreateLocalSessionResponse>;
        resizeSession(payload: ResizeSessionRequest): Promise<OkResponse>;
        killSession(payload: KillSessionRequest): Promise<OkResponse>;
        listSessions(): Promise<ListSessionsResponse>;
      };
      system: {
        getMetrics(): Promise<SystemMetricsResponse>;
        notify(payload: SystemNotifyRequest): Promise<OkResponse>;
      };
      workspace: {
        save(payload: WorkspaceSnapshot): Promise<OkResponse>;
        load(payload: WorkspaceIdRequest): Promise<WorkspaceSnapshot>;
        list(): Promise<WorkspaceListResponse>;
        close(payload: WorkspaceIdRequest): Promise<OkResponse>;
        delete(payload: WorkspaceIdRequest): Promise<OkResponse>;
        getDefault(): Promise<WorkspaceGetDefaultResponse>;
        getGlobalLibrary(payload: WorkspaceGlobalLibraryGetRequest): Promise<WorkspaceGlobalLibraryGetResponse>;
        setGlobalLibrary(payload: WorkspaceGlobalLibrarySetRequest): Promise<OkResponse>;
        removeGlobalLibrary(payload: WorkspaceGlobalLibraryGetRequest): Promise<OkResponse>;
        getStorageInfo(): Promise<WorkspaceStorageInfoResponse>;
      };
      gateway: {
        getConfig(): Promise<ApiGatewayConfig>;
        saveConfig(payload: ApiGatewaySaveConfigRequest): Promise<ApiGatewayConfig>;
        getStatus(): Promise<ApiGatewayStatus>;
        start(): Promise<ApiGatewayStatus>;
        stop(): Promise<ApiGatewayStatus>;
        checkProviderHealth(
          payload: ApiGatewayCheckProviderHealthRequest
        ): Promise<ApiGatewayCheckProviderHealthResponse>;
      };
      widgetRegistry: {
        save(payload: WidgetRegistrySnapshot): Promise<OkResponse>;
        load(): Promise<WidgetRegistrySnapshot>;
      };
      file: {
        pickDirectory(): Promise<FsPickDirectoryResponse>;
        pickFile(payload?: FsPickFileRequest): Promise<FsPickFileResponse>;
        readDir(payload: FsReadDirRequest): Promise<FsReadDirResponse>;
        readFile(payload: FsReadFileRequest): Promise<FsReadFileResponse>;
      };
      agentConfigs: {
        list(payload: AgentConfigListRequest): Promise<AgentConfigListResponse>;
        readFile(payload: AgentConfigReadFileRequest): Promise<AgentConfigReadFileResponse>;
        writeFile(payload: AgentConfigWriteFileRequest): Promise<OkResponse>;
        revealPath(payload: AgentConfigRevealPathRequest): Promise<OkResponse>;
      };
      git: {
        readDiff(payload: GitReadDiffRequest): Promise<GitReadDiffResponse>;
      };
      extension: {
        getHostConfig(): Promise<ExtensionHostConfig>;
      };
    };
  }
}

export {};
