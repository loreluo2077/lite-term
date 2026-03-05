/**
 * Widget-centric tab runtime state.
 * Layout is tracked by Workspace/Panel/Tab; content/runtime is tracked by Widget.
 */
import { atom } from "jotai";
import type {
  CreateLocalSessionResponse,
  SessionStatus,
  WidgetKind
} from "@localterm/shared";

export type WidgetLifecycleStatus = "idle" | SessionStatus;
export type TabWidget = {
  kind: WidgetKind;
  input: Record<string, unknown>;
};

type BaseWidgetTabRecord = {
  id: string;
  title: string;
  widgetKind: WidgetKind;
  widget: TabWidget;
  // Legacy compatibility field retained during tab->widget migration.
  tabKind?: WidgetKind;
  input: Record<string, unknown>;
  status: WidgetLifecycleStatus;
  wsConnected: boolean;
  session?: CreateLocalSessionResponse | undefined;
};

export type WidgetTabRecord = BaseWidgetTabRecord;
export type LocalTerminalWidgetTabRecord = WidgetTabRecord & {
  widgetKind: "terminal.local";
  tabKind?: "terminal.local";
};
export type NonTerminalWidgetTabRecord = WidgetTabRecord & {
  widgetKind: Exclude<WidgetKind, "terminal.local">;
  session?: undefined;
};

export const widgetTabsAtom = atom<WidgetTabRecord[]>([]);
export const activeWidgetTabIdAtom = atom<string>("");

export const activeWidgetTabAtom = atom((get) => {
  const id = get(activeWidgetTabIdAtom);
  return get(widgetTabsAtom).find((tab) => tab.id === id) ?? null;
});

export function isLocalTerminalWidgetTab(
  tab: WidgetTabRecord
): tab is LocalTerminalWidgetTabRecord {
  const resolvedKind = tab.widgetKind ?? tab.tabKind ?? tab.widget.kind;
  return tab.widget.kind === "terminal.local" && resolvedKind === "terminal.local";
}

// Backward-compatible aliases for pre-widget naming.
export type TabLifecycleStatus = WidgetLifecycleStatus;
export type LocalTerminalTabRecord = LocalTerminalWidgetTabRecord;
export type NonTerminalTabRecord = NonTerminalWidgetTabRecord;
export type TabRecord = WidgetTabRecord;
export const tabsAtom = widgetTabsAtom;
export const activeTabIdAtom = activeWidgetTabIdAtom;
export const activeTabAtom = activeWidgetTabAtom;
