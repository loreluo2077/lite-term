import type {
  AgentConfigListResponse,
  AgentConfigReadFileResponse,
  ExtensionWidgetInput
} from "@localterm/shared";

type WidgetApiContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
};

declare global {
  interface Window {
    widgetApi: {
      widget: {
        getContext(): Promise<WidgetApiContext>;
        setTitle(title: string): Promise<{ ok: true }>;
        openWidget(request: {
          widgetId: string;
          title?: string;
          state?: Record<string, unknown>;
        }): Promise<{ ok: true }>;
      };
      state: {
        get(): Promise<Record<string, unknown>>;
        patch(state: Record<string, unknown>): Promise<{ ok: true }>;
      };
      agentConfigs: {
        list(payload?: { workspaceRootPath?: string | null }): Promise<AgentConfigListResponse>;
        readFile(payload: { path: string }): Promise<AgentConfigReadFileResponse>;
        writeFile(payload: { path: string; content: string }): Promise<{ ok: true }>;
        revealPath(payload: { path: string }): Promise<{ ok: true }>;
      };
    };
  }
}

export {};
