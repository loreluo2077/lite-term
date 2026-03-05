import type { ReactNode } from "react";
import type { ExtensionManifest, ExtensionWidgetInput } from "@localterm/shared";

export type OpenWidgetRequest = {
  extensionId?: string;
  widgetId: string;
  title?: string;
  state?: Record<string, unknown>;
  paneId?: string;
};

export type WidgetRenderContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  state: Record<string, unknown>;
  setState: (
    next:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>)
  ) => void;
  setTitle: (nextTitle: string) => void;
  openWidget: (request: OpenWidgetRequest) => void;
};

export type WidgetContribution = {
  extensionId: string;
  widgetId: string;
  title: string;
  defaultState: Record<string, unknown>;
  render: (context: WidgetRenderContext) => ReactNode;
};

export type RendererExtension = {
  manifest: ExtensionManifest;
  widgets: WidgetContribution[];
};

export type WidgetTemplate = {
  extensionId: string;
  widgetId: string;
  title: string;
  defaultState: Record<string, unknown>;
};
