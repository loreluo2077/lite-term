/**
 * Jotai atoms for tab/session metadata and lifecycle state.
 */
import { atom } from "jotai";
import type { CreateLocalSessionResponse, SessionStatus, TabKind } from "@localterm/shared";

export type TabRecord = {
  id: string;
  tabKind: TabKind;
  title: string;
  input: Record<string, unknown>;
  session?: CreateLocalSessionResponse | undefined;
  status: "idle" | SessionStatus;
  wsConnected: boolean;
};

export const tabsAtom = atom<TabRecord[]>([]);
export const activeTabIdAtom = atom<string>("");

export const activeTabAtom = atom((get) => {
  const id = get(activeTabIdAtom);
  return get(tabsAtom).find((tab) => tab.id === id) ?? null;
});
