import type {
  CreateLocalSessionRequest,
  CreateLocalSessionResponse,
  PluginViewTabInput,
  SessionStatus,
  TabKind
} from "@localterm/shared";

export type LocalTerminalDriverInput = Omit<CreateLocalSessionRequest, "sessionType">;

export type TabDriverInputMap = {
  "terminal.local": LocalTerminalDriverInput;
  "terminal.ssh": Record<string, unknown>;
  "web.page": Record<string, unknown>;
  "web.browser": Record<string, unknown>;
  "widget.react": Record<string, unknown>;
  "plugin.view": PluginViewTabInput;
};

export type TabDriverHandle = {
  status: SessionStatus | "idle";
  session?: CreateLocalSessionResponse | undefined;
};

export interface TabDriver<K extends TabKind = TabKind> {
  kind: K;
  create(input: TabDriverInputMap[K]): Promise<TabDriverHandle>;
  restore(input: TabDriverInputMap[K]): Promise<TabDriverHandle>;
  dispose(handle: TabDriverHandle): Promise<void>;
}
