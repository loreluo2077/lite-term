import type { TabDriver } from "../types";

export const pluginViewTabDriver: TabDriver<"plugin.view"> = {
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
    // plugin tabs do not own process resources in phase 1
  }
};
