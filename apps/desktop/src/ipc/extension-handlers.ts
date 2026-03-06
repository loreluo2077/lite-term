import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  extensionHostConfigSchema
} from "@localterm/shared";

function resolveWidgetWebviewPreloadUrl() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const preloadPath = path.resolve(__dirname, "../preload/widget-webview.cjs");
  return pathToFileURL(preloadPath).toString();
}

export function registerExtensionIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.extensionGetHostConfig, async () => {
    return extensionHostConfigSchema.parse({
      widgetWebviewPreloadUrl: resolveWidgetWebviewPreloadUrl()
    });
  });
}
