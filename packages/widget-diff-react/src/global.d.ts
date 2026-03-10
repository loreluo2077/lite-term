import type {
  ExtensionWidgetInput,
  FsPickDirectoryResponse,
  GitReadDiffRequest,
  GitReadDiffResponse
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

declare global {
  interface Window {
    widgetApi: {
      widget: {
        getContext(): Promise<WidgetApiContext>;
        setTitle(title: string): Promise<{ ok: true }>;
        openWidget(request: Record<string, unknown>): Promise<{ ok: true }>;
      };
      state: {
        get(): Promise<Record<string, unknown>>;
        set(state: Record<string, unknown>): Promise<{ ok: true }>;
        patch(state: Record<string, unknown>): Promise<{ ok: true }>;
        onDidChange(listener: WidgetStateListener): () => void;
      };
      fs: {
        pickDirectory(): Promise<FsPickDirectoryResponse>;
      };
      git: {
        readDiff(payload: GitReadDiffRequest): Promise<GitReadDiffResponse>;
      };
    };
  }
}

export {};
