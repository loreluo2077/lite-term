import type { ReactNode } from "react";
import type { PluginManifest, PluginWidgetInput } from "@localterm/shared";

export type OpenPluginWidgetRequest = {
  pluginId?: string;
  widgetId?: string;
  // Legacy compatibility field.
  viewId?: string;
  title?: string;
  state?: Record<string, unknown>;
  paneId?: string;
};

export type PluginWidgetRenderContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: PluginWidgetInput;
  state: Record<string, unknown>;
  setState: (
    next:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>)
  ) => void;
  setTitle: (nextTitle: string) => void;
  openPluginWidget: (request: OpenPluginWidgetRequest) => void;
  // Legacy compatibility alias.
  openPluginView: (request: OpenPluginWidgetRequest) => void;
};

export type PluginWidgetContribution = {
  pluginId: string;
  widgetId: string;
  title: string;
  defaultState: Record<string, unknown>;
  render: (context: PluginWidgetRenderContext) => ReactNode;
};

export type RendererPlugin = {
  manifest: PluginManifest;
  widgets: PluginWidgetContribution[];
};

export type PluginWidgetTemplate = {
  pluginId: string;
  widgetId: string;
  title: string;
  defaultState: Record<string, unknown>;
};

// Backward-compatible aliases.
export type OpenPluginViewRequest = OpenPluginWidgetRequest;
export type PluginViewRenderContext = PluginWidgetRenderContext;
export type PluginViewContribution = PluginWidgetContribution;
export type PluginViewTemplate = PluginWidgetTemplate;
