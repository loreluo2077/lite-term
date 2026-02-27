import type {
  CreateLocalSessionRequest,
  CreateLocalSessionResponse,
  KillSessionRequest,
  ListSessionsResponse,
  OkResponse,
  ResizeSessionRequest,
  SystemMetricsResponse
} from "@localterm/shared";

declare global {
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
    };
  }
}

export {};
