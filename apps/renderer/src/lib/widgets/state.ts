/**
 * Widget-centric tab runtime state.
 * Layout is tracked by Workspace/Panel/Tab; content/runtime is tracked by Widget.
 */
import { atom } from "jotai";
import type {
  CreateLocalSessionResponse,
  ExtensionWidgetInput,
  SessionStatus,
  WidgetKind
} from "@localterm/shared";
import { extensionWidgetInputSchema } from "@localterm/shared";

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
  input: Record<string, unknown>;
  status: WidgetLifecycleStatus;
  wsConnected: boolean;
  session?: CreateLocalSessionResponse | undefined;
};

export type WidgetTabRecord = BaseWidgetTabRecord;
export type ExtensionTerminalWidgetTabRecord = WidgetTabRecord & {
  widgetKind: "extension.widget";
  widget: {
    kind: "extension.widget";
    input: ExtensionWidgetInput;
  };
};
export type NonTerminalWidgetTabRecord = WidgetTabRecord & {
  session?: undefined;
};

export const widgetTabsAtom = atom<WidgetTabRecord[]>([]);
export const activeWidgetTabIdAtom = atom<string>("");

export const activeWidgetTabAtom = atom((get) => {
  const id = get(activeWidgetTabIdAtom);
  return get(widgetTabsAtom).find((tab) => tab.id === id) ?? null;
});

export function isExtensionTerminalWidgetTab(
  tab: WidgetTabRecord
): tab is ExtensionTerminalWidgetTabRecord {
  if (tab.widget.kind !== "extension.widget" || tab.widgetKind !== "extension.widget") {
    return false;
  }
  const parsed = extensionWidgetInputSchema.safeParse(tab.widget.input);
  return (
    parsed.success &&
    parsed.data.extensionId === "builtin.workspace" &&
    parsed.data.widgetId === "terminal.local"
  );
}
