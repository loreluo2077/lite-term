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
  WorkspaceIdRequest,
  WorkspaceListResponse,
  WorkspaceSnapshot,
  FsPickDirectoryResponse,
  FsPickFileRequest,
  FsPickFileResponse,
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
      };
      file: {
        pickDirectory(): Promise<FsPickDirectoryResponse>;
        pickFile(payload?: FsPickFileRequest): Promise<FsPickFileResponse>;
        readDir(payload: FsReadDirRequest): Promise<FsReadDirResponse>;
        readFile(payload: FsReadFileRequest): Promise<FsReadFileResponse>;
      };
      extension: {
        getHostConfig(): Promise<ExtensionHostConfig>;
      };
    };
  }
}

export {};
