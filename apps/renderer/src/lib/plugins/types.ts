import type { ExtensionPermission, ExtensionWidgetInput } from "@localterm/shared";

export type OpenWidgetRequest = {
  extensionId?: string;
  widgetId: string;
  title?: string;
  state?: Record<string, unknown>;
  paneId?: string;
};

export type WidgetTemplate = {
  extensionId: string;
  widgetId: string;
  title: string;
  defaultState: Record<string, unknown>;
  permissions: ExtensionPermission[];
};

export type WidgetTemplateMap = Map<string, WidgetTemplate>;

export type WidgetApiRequest = {
  requestId: string;
  method: string;
  params?: Record<string, unknown>;
};

export type WidgetApiResponse = {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type WidgetTabSummary = {
  tabId: string;
  title: string;
  kind: string;
};

export type WidgetContextPayload = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  workspaceId: string;
  workspaceName: string;
};
