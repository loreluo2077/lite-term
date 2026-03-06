import type { WidgetKind } from "@localterm/shared";
import { createNoopWidgetDriver } from "./drivers/noop-widget-driver";
import { extensionWidgetDriver } from "./drivers/extension-widget-driver";
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

registerWidgetDriver(extensionWidgetDriver);
registerWidgetDriver(createNoopWidgetDriver("terminal.ssh"));
registerWidgetDriver(createNoopWidgetDriver("web.page"));
registerWidgetDriver(createNoopWidgetDriver("web.browser"));
registerWidgetDriver(createNoopWidgetDriver("widget.react"));
registerWidgetDriver(createNoopWidgetDriver("file.browser"));
registerWidgetDriver(createNoopWidgetDriver("note.markdown"));
