import type { TabKind } from "@localterm/shared";
import { localTerminalTabDriver } from "./drivers/local-terminal-driver";
import { createNoopTabDriver } from "./drivers/noop-driver";
import { pluginViewTabDriver } from "./drivers/plugin-view-driver";
import type { TabDriver } from "./types";

const tabDriverRegistry = new Map<TabKind, TabDriver>();

export function registerTabDriver(driver: TabDriver) {
  tabDriverRegistry.set(driver.kind, driver);
}

export function getTabDriver<K extends TabKind>(kind: K): TabDriver<K> {
  const driver = tabDriverRegistry.get(kind);
  if (!driver) {
    throw new Error(`tab driver not registered for kind: ${kind}`);
  }
  return driver as TabDriver<K>;
}

export function listRegisteredTabKinds(): TabKind[] {
  return [...tabDriverRegistry.keys()];
}

registerTabDriver(localTerminalTabDriver);
registerTabDriver(pluginViewTabDriver);
registerTabDriver(createNoopTabDriver("terminal.ssh"));
registerTabDriver(createNoopTabDriver("web.page"));
registerTabDriver(createNoopTabDriver("web.browser"));
registerTabDriver(createNoopTabDriver("widget.react"));
