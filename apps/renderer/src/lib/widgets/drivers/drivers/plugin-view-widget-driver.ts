import type { WidgetDriver } from "../types";

export const pluginViewWidgetDriver: WidgetDriver<"plugin.view"> = {
  kind: "plugin.view",
  async create() {
    return {
      status: "idle"
    };
  },
  async restore() {
    return {
      status: "idle"
    };
  },
  async dispose() {
    // plugin widgets do not own process resources in phase 1
  }
};

// Backward-compatible alias.
export const pluginViewTabDriver = pluginViewWidgetDriver;
