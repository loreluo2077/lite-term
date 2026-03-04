/**
 * Jotai atoms for tab/session metadata and lifecycle state.
 */
import { atom } from "jotai";
import type { CreateLocalSessionResponse, SessionStatus, TabKind } from "@localterm/shared";

export type TabLifecycleStatus = "idle" | SessionStatus;

export type TabWidget = {
  kind: TabKind;
  input: Record<string, unknown>;
};

type BaseTabRecord = {
  id: string;
  tabKind: TabKind;
  widget: TabWidget;
  title: string;
  // Legacy compatibility field. Keep in sync with widget.input during migration.
  input: Record<string, unknown>;
  status: TabLifecycleStatus;
  wsConnected: boolean;
};

// Session runtime is scoped to local terminal widget tabs only.
export type LocalTerminalTabRecord = BaseTabRecord & {
  tabKind: "terminal.local";
  session?: CreateLocalSessionResponse | undefined;
};

export type NonTerminalTabRecord = BaseTabRecord & {
  tabKind: Exclude<TabKind, "terminal.local">;
  session?: undefined;
};

export type TabRecord = LocalTerminalTabRecord | NonTerminalTabRecord;

export const tabsAtom = atom<TabRecord[]>([]);
export const activeTabIdAtom = atom<string>("");

export const activeTabAtom = atom((get) => {
  const id = get(activeTabIdAtom);
  return get(tabsAtom).find((tab) => tab.id === id) ?? null;
});
