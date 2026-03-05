import type { ReactNode } from "react";
import type { ExtensionManifest, ExtensionWidgetInput } from "@localterm/shared";

export type OpenWidgetRequest = {
  extensionId?: string;
  // Legacy compatibility field.
  pluginId?: string;
  widgetId?: string;
  // Legacy compatibility field.
  viewId?: string;
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
  // Alias kept for compatibility.
  openPluginWidget: (request: OpenWidgetRequest) => void;
  // Legacy compatibility alias.
  openPluginView: (request: OpenWidgetRequest) => void;
};

export type WidgetContribution = {
  extensionId: string;
  // Legacy compatibility field.
  pluginId?: string;
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
  // Legacy compatibility field.
  pluginId?: string;
  widgetId: string;
  title: string;
  defaultState: Record<string, unknown>;
};

// Backward-compatible aliases.
export type OpenPluginWidgetRequest = OpenWidgetRequest;
export type OpenPluginViewRequest = OpenWidgetRequest;
export type PluginWidgetRenderContext = WidgetRenderContext;
export type PluginViewRenderContext = WidgetRenderContext;
export type PluginWidgetContribution = WidgetContribution;
export type PluginViewContribution = WidgetContribution;
export type PluginWidgetTemplate = WidgetTemplate;
export type PluginViewTemplate = WidgetTemplate;
export type RendererPlugin = RendererExtension;
