import type { WidgetKind } from "@localterm/shared";
import { localTerminalWidgetDriver } from "./drivers/local-terminal-widget-driver";
import { createNoopWidgetDriver } from "./drivers/noop-widget-driver";
import { pluginViewWidgetDriver } from "./drivers/plugin-view-widget-driver";
import type { WidgetDriver } from "./types";

const widgetDriverRegistry = new Map<WidgetKind, WidgetDriver>();

export function registerWidgetDriver(driver: WidgetDriver) {
  widgetDriverRegistry.set(driver.kind, driver);
}

export function getWidgetDriver<K extends WidgetKind>(kind: K): WidgetDriver<K> {
  const driver = widgetDriverRegistry.get(kind);
  if (!driver) {
    throw new Error(`widget driver not registered for kind: ${kind}`);
  }
  return driver as WidgetDriver<K>;
}

export function listRegisteredWidgetKinds(): WidgetKind[] {
  return [...widgetDriverRegistry.keys()];
}

registerWidgetDriver(localTerminalWidgetDriver);
registerWidgetDriver(pluginViewWidgetDriver);
registerWidgetDriver(createNoopWidgetDriver("plugin.view"));
registerWidgetDriver(createNoopWidgetDriver("terminal.ssh"));
registerWidgetDriver(createNoopWidgetDriver("web.page"));
registerWidgetDriver(createNoopWidgetDriver("web.browser"));
registerWidgetDriver(createNoopWidgetDriver("widget.react"));
registerWidgetDriver(createNoopWidgetDriver("file.browser"));
registerWidgetDriver(createNoopWidgetDriver("note.markdown"));

// Backward-compatible aliases.
export const registerTabDriver = registerWidgetDriver;
export const getTabDriver = getWidgetDriver;
export const listRegisteredTabKinds = listRegisteredWidgetKinds;
