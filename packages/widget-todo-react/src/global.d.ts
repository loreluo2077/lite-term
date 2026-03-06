import type { ExtensionWidgetInput } from "@localterm/shared";

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
      };
      state: {
        get(): Promise<Record<string, unknown>>;
        patch(state: Record<string, unknown>): Promise<{ ok: true }>;
        onDidChange(listener: WidgetStateListener): () => void;
      };
      workspace: {
        getCurrent(): Promise<{ id: string; name: string }>;
      };
    };
  }
}

export {};
