import type { WidgetDriver } from "../types";

export const pluginWidgetDriver: WidgetDriver<"plugin.widget"> = {
  kind: "plugin.widget",
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

// Backward-compatible aliases.
export const pluginViewWidgetDriver = pluginWidgetDriver;
export const pluginViewTabDriver = pluginWidgetDriver;
