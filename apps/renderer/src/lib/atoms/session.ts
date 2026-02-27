/**
 * Jotai atoms for tab/session metadata and lifecycle state.
 */
import { atom } from "jotai";
import type { CreateLocalSessionResponse } from "@localterm/shared";

export type TabRecord = {
  id: string;
  title: string;
  session?: CreateLocalSessionResponse;
  status: "idle" | "starting" | "ready" | "exited" | "error";
  wsConnected: boolean;
};

export const tabsAtom = atom<TabRecord[]>([]);
export const activeTabIdAtom = atom<string>("");

export const activeTabAtom = atom((get) => {
  const id = get(activeTabIdAtom);
  return get(tabsAtom).find((tab) => tab.id === id) ?? null;
});
