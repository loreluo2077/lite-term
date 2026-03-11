import { Notification, ipcMain } from "electron";
import {
  IPC_CHANNELS,
  okResponseSchema,
  systemNotifyRequestSchema
} from "@localterm/shared";
import { getMainWindow } from "../window/create-main-window";

export function registerSystemIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.systemNotify, async (_event, payload) => {
    const request = systemNotifyRequestSchema.parse(payload);
    const notification = new Notification({
      title: request.title,
      body: request.body,
      silent: request.silent ?? false
    });
    notification.on("click", () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    });
    notification.show();
    return okResponseSchema.parse({ ok: true });
  });
}
