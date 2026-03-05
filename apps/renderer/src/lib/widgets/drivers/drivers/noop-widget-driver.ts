import type { WidgetKind } from "@localterm/shared";
import type { WidgetDriver } from "../types";

export function createNoopWidgetDriver<K extends WidgetKind>(kind: K): WidgetDriver<K> {
  return {
    kind,
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
      // no-op for non-session widgets
    }
  };
}

