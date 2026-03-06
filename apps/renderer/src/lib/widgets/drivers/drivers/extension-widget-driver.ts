import { extensionWidgetInputSchema } from "@localterm/shared";
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
  async dispose(handle) {
    const parsed = extensionWidgetInputSchema.safeParse(handle.input);
    if (!parsed.success) return;

    const input = parsed.data;
    if (input.extensionId !== "builtin.workspace" || input.widgetId !== "terminal.local") {
      return;
    }

    const sessionId =
      input.state && typeof input.state.sessionId === "string"
        ? input.state.sessionId
        : "";
    if (!sessionId) return;

    await window.localtermApi.session
      .killSession({ sessionId })
      .catch(() => undefined);
  }
};
