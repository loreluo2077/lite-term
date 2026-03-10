import { app, ipcMain } from "electron";
import {
  IPC_CHANNELS,
  workspaceGlobalLibraryGetRequestSchema,
  workspaceGlobalLibrarySetRequestSchema,
  workspaceIdRequestSchema,
  workspaceListResponseSchema,
  workspaceStorageInfoResponseSchema
} from "@localterm/shared";
import {
  closeWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  getDefaultWorkspaceSnapshot,
  loadWidgetRegistry,
  listWorkspaces,
  loadWorkspaceSnapshot,
  saveWidgetRegistry,
  saveWorkspaceSnapshot
} from "../lib/workspace-storage";
import {
  getWorkspaceStorageInfo,
  readGlobalLibrary,
  removeGlobalLibrary,
  writeGlobalLibrary
} from "../lib/global-library-storage";

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

  ipcMain.handle(IPC_CHANNELS.workspaceGlobalLibraryGet, async (_event, payload) => {
    const { key } = workspaceGlobalLibraryGetRequestSchema.parse(payload);
    return await readGlobalLibrary(getUserDataDir(), key);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceGlobalLibrarySet, async (_event, payload) => {
    const { key, value } = workspaceGlobalLibrarySetRequestSchema.parse(payload);
    return await writeGlobalLibrary(getUserDataDir(), key, value);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceGlobalLibraryRemove, async (_event, payload) => {
    const { key } = workspaceGlobalLibraryGetRequestSchema.parse(payload);
    return await removeGlobalLibrary(getUserDataDir(), key);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceStorageInfo, async () => {
    return workspaceStorageInfoResponseSchema.parse(getWorkspaceStorageInfo(getUserDataDir()));
  });

  ipcMain.handle(IPC_CHANNELS.widgetRegistrySave, async (_event, payload) => {
    return await saveWidgetRegistry(getUserDataDir(), payload);
  });

  ipcMain.handle(IPC_CHANNELS.widgetRegistryLoad, async () => {
    return await loadWidgetRegistry(getUserDataDir());
  });
}
