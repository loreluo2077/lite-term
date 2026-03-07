import type {
  ExtensionWidgetInput,
  FileDialogFilter,
  FsReadDirResponse,
  FsPickDirectoryResponse,
  FsPickFileResponse,
  FsReadFileResponse,
  LocalSessionStartupScript
} from "@localterm/shared";

type WidgetApiContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  workspaceId: string;
  workspaceName: string;
};

type WidgetStateListener = (state: Record<string, unknown>) => void;

type OpenWidgetRequest = {
  extensionId?: string;
  widgetId: string;
  title?: string;
  state?: Record<string, unknown>;
  paneId?: string;
};

type TerminalSessionSummary = {
  sessionId: string;
  pid: number;
  port: number;
  status: "starting" | "ready" | "exited" | "error";
};

type TerminalCreateRequest = {
  cols: number;
  rows: number;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  shellArgs?: string[];
  startupScripts?: LocalSessionStartupScript[];
};

type TerminalCreateResponse = {
  sessionId: string;
  port: number;
  pid: number;
  status: "starting" | "ready";
  wsUrl: string;
};

declare global {
  interface Window {
    widgetApi: {
      apiVersion: string;
      widget: {
        getContext(): Promise<WidgetApiContext>;
        setTitle(title: string): Promise<{ ok: true }>;
        openWidget(request: OpenWidgetRequest): Promise<{ ok: true }>;
      };
      state: {
        get(): Promise<Record<string, unknown>>;
        set(state: Record<string, unknown>): Promise<{ ok: true }>;
        patch(state: Record<string, unknown>): Promise<{ ok: true }>;
        onDidChange(listener: WidgetStateListener): () => void;
      };
      workspace: {
        getCurrent(): Promise<{ id: string; name: string }>;
        listTabs(): Promise<Array<{ tabId: string; title: string; kind: string }>>;
        activateTab(tabId: string): Promise<{ ok: true }>;
      };
      fs: {
        pickDirectory(): Promise<FsPickDirectoryResponse>;
        pickFile(payload?: { filters?: FileDialogFilter[] }): Promise<FsPickFileResponse>;
        readDir(payload: { dirPath: string; includeHidden?: boolean }): Promise<FsReadDirResponse>;
        readFile(payload: { filePath: string; maxBytes?: number }): Promise<FsReadFileResponse>;
      };
      terminal: {
        create(payload: TerminalCreateRequest): Promise<TerminalCreateResponse>;
        write(payload: { sessionId: string; data: string }): Promise<{ ok: true }>;
        resize(payload: { sessionId: string; cols: number; rows: number }): Promise<{ ok: true }>;
        kill(payload: { sessionId: string }): Promise<{ ok: true }>;
        list(): Promise<TerminalSessionSummary[]>;
      };
    };
  }
}

export {};
