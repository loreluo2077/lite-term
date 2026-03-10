import type { ExtensionWidgetInput } from "@localterm/shared";

type WidgetApiContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
};

type WidgetStateListener = (state: Record<string, unknown>) => void;

type WorkspaceTabSummary = {
  tabId: string;
  title: string;
  kind: string;
  isActive?: boolean;
  extensionId?: string | null;
  widgetId?: string | null;
  sessionId?: string | null;
};

type TerminalSessionSummary = {
  sessionId: string;
  pid: number;
  port: number;
  status: "starting" | "ready" | "exited" | "error";
};

declare global {
  interface Window {
    widgetApi: {
      widget: {
        getContext(): Promise<WidgetApiContext>;
        setTitle(title: string): Promise<{ ok: true }>;
      };
      state: {
        get(): Promise<Record<string, unknown>>;
        patch(state: Record<string, unknown>): Promise<{ ok: true }>;
        onDidChange(listener: WidgetStateListener): () => void;
      };
      workspace: {
        getCurrent(): Promise<{ id: string; name: string; rootPath: string }>;
        listTabs(): Promise<WorkspaceTabSummary[]>;
      };
      storage: {
        get(key: string): Promise<{ value: string | null }>;
        set(key: string, value: string): Promise<{ ok: true }>;
        remove(key: string): Promise<{ ok: true }>;
      };
      terminal: {
        write(payload: { sessionId: string; data: string }): Promise<{ ok: true }>;
        list(): Promise<TerminalSessionSummary[]>;
      };
    };
  }
}

export {};
