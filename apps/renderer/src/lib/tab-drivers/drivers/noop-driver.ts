import type { TabKind } from "@localterm/shared";
import type { TabDriver } from "../types";

export function createNoopTabDriver<K extends TabKind>(kind: K): TabDriver<K> {
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
      // no-op for non-session tabs
    }
  };
}
