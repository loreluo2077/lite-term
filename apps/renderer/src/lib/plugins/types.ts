import type { ReactNode } from "react";
import type { PluginManifest, PluginViewTabInput } from "@localterm/shared";

export type OpenPluginViewRequest = {
  pluginId?: string;
  viewId: string;
  title?: string;
  state?: Record<string, unknown>;
  paneId?: string;
};

export type PluginViewRenderContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: PluginViewTabInput;
  state: Record<string, unknown>;
  setState: (
    next:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>)
  ) => void;
  setTitle: (nextTitle: string) => void;
  openPluginView: (request: OpenPluginViewRequest) => void;
};

export type PluginViewContribution = {
  pluginId: string;
  viewId: string;
  title: string;
  defaultState: Record<string, unknown>;
  render: (context: PluginViewRenderContext) => ReactNode;
};

export type RendererPlugin = {
  manifest: PluginManifest;
  views: PluginViewContribution[];
};

export type PluginViewTemplate = {
  pluginId: string;
  viewId: string;
  title: string;
  defaultState: Record<string, unknown>;
};
