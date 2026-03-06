import type {
  CreateLocalSessionResponse,
  ExtensionWidgetInput,
  SessionStatus,
  WidgetKind
} from "@localterm/shared";

export type WidgetDriverInputMap = {
  "terminal.ssh": Record<string, unknown>;
  "web.page": Record<string, unknown>;
  "web.browser": Record<string, unknown>;
  "widget.react": Record<string, unknown>;
  "extension.widget": ExtensionWidgetInput;
  "file.browser": ExtensionWidgetInput;
  "note.markdown": ExtensionWidgetInput;
};

export type WidgetDriverHandle = {
  status: SessionStatus | "idle";
  session?: CreateLocalSessionResponse | undefined;
  input?: Record<string, unknown> | undefined;
};

export interface WidgetDriver<K extends WidgetKind = WidgetKind> {
  kind: K;
  create(input: WidgetDriverInputMap[K]): Promise<WidgetDriverHandle>;
  restore(input: WidgetDriverInputMap[K]): Promise<WidgetDriverHandle>;
  dispose(handle: WidgetDriverHandle): Promise<void>;
}
