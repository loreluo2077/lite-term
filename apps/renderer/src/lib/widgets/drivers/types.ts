import type {
  CreateLocalSessionRequest,
  CreateLocalSessionResponse,
  PluginWidgetInput,
  SessionStatus,
  WidgetKind
} from "@localterm/shared";

export type LocalTerminalWidgetInput = Omit<CreateLocalSessionRequest, "sessionType">;

export type WidgetDriverInputMap = {
  "terminal.local": LocalTerminalWidgetInput;
  "terminal.ssh": Record<string, unknown>;
  "web.page": Record<string, unknown>;
  "web.browser": Record<string, unknown>;
  "widget.react": Record<string, unknown>;
  "plugin.widget": PluginWidgetInput;
  "plugin.view": PluginWidgetInput;
  "file.browser": PluginWidgetInput;
  "note.markdown": PluginWidgetInput;
};

export type WidgetDriverHandle = {
  status: SessionStatus | "idle";
  session?: CreateLocalSessionResponse | undefined;
};

export interface WidgetDriver<K extends WidgetKind = WidgetKind> {
  kind: K;
  create(input: WidgetDriverInputMap[K]): Promise<WidgetDriverHandle>;
  restore(input: WidgetDriverInputMap[K]): Promise<WidgetDriverHandle>;
  dispose(handle: WidgetDriverHandle): Promise<void>;
}

// Backward-compatible aliases.
export type LocalTerminalDriverInput = LocalTerminalWidgetInput;
export type TabDriverInputMap = WidgetDriverInputMap;
export type TabDriverHandle = WidgetDriverHandle;
export type TabDriver<K extends WidgetKind = WidgetKind> = WidgetDriver<K>;
