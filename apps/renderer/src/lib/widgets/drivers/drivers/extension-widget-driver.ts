import type { WidgetDriver } from "../types";

export const extensionWidgetDriver: WidgetDriver<"extension.widget"> = {
  kind: "extension.widget",
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
    // extension widgets do not own process resources in phase 1
  }
};
