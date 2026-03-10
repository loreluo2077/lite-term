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
  WorkspaceGetDefaultResponse,
  WorkspaceGlobalLibraryGetRequest,
  WorkspaceGlobalLibraryGetResponse,
  WorkspaceGlobalLibrarySetRequest,
  WorkspaceIdRequest,
  WorkspaceListResponse,
  WorkspaceStorageInfoResponse,
  WorkspaceSnapshot,
  WidgetRegistrySnapshot,
  FsPickDirectoryResponse,
  FsPickFileRequest,
  FsPickFileResponse,
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
