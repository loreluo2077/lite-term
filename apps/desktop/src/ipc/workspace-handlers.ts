import { app, ipcMain } from "electron";
import {
  IPC_CHANNELS,
  workspaceIdRequestSchema,
  workspaceListResponseSchema
} from "@localterm/shared";
import {
  closeWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  getDefaultWorkspaceSnapshot,
  listWorkspaces,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot
} from "../lib/workspace-storage";

function getUserDataDir() {
  return app.getPath("userData");
}

export function registerWorkspaceIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.workspaceSave, async (_event, payload) => {
    return await saveWorkspaceSnapshot(getUserDataDir(), payload);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceLoad, async (_event, payload) => {
    const { id } = workspaceIdRequestSchema.parse(payload);
    return await loadWorkspaceSnapshot(getUserDataDir(), id);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceList, async () => {
    const listed = await listWorkspaces(getUserDataDir());
    return workspaceListResponseSchema.parse(listed);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceClose, async (_event, payload) => {
    const { id } = workspaceIdRequestSchema.parse(payload);
    return await closeWorkspaceSnapshot(getUserDataDir(), id);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceDelete, async (_event, payload) => {
    const { id } = workspaceIdRequestSchema.parse(payload);
    return await deleteWorkspaceSnapshot(getUserDataDir(), id);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceGetDefault, async () => {
    return await getDefaultWorkspaceSnapshot(getUserDataDir());
  });
}
