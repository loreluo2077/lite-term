/**
 * Electron main process entry.
 * This layer is the desktop shell, not the terminal engine.
 */
import { app } from "electron";
import { registerFileIpcHandlers } from "../ipc/file-handlers";
import { createMainWindow } from "../window/create-main-window";
import { registerSessionIpcHandlers } from "../ipc/session-handlers";
import { registerWorkspaceIpcHandlers } from "../ipc/workspace-handlers";

export async function bootstrapDesktopApp() {
  registerSessionIpcHandlers();
  registerWorkspaceIpcHandlers();
  registerFileIpcHandlers();
  await createMainWindow();
}

let started = false;

async function main() {
  if (started) return;
  started = true;
  await app.whenReady();
  await bootstrapDesktopApp();

  app.on("activate", async () => {
    if (started) return;
    await bootstrapDesktopApp();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

void main().catch((error) => {
  console.error("[desktop bootstrap error]", error);
  app.quit();
});
