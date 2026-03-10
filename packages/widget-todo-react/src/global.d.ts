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
      };
      storage: {
        get(key: string): Promise<{ value: string | null }>;
        set(key: string, value: string): Promise<{ ok: true }>;
        remove(key: string): Promise<{ ok: true }>;
      };
    };
  }
}

export {};
