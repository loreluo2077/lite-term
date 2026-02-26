/**
 * IPC handlers forward session control requests to control-plane.
 * They should remain thin and type-driven.
 */
import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  type CreateLocalSessionRequest,
  type KillSessionRequest,
  type ResizeSessionRequest
} from "@localterm/shared";
import { getControlPlaneService } from "@localterm/control-plane";

export function registerSessionIpcHandlers() {
  const controlPlane = getControlPlaneService();
  ipcMain.handle(IPC_CHANNELS.sessionCreateLocal, async (_event, payload: CreateLocalSessionRequest) => {
    return await controlPlane.createLocalSession(payload);
  });
  ipcMain.handle(IPC_CHANNELS.sessionResize, async (_event, payload: ResizeSessionRequest) => {
    return await controlPlane.resizeSession(payload);
  });
  ipcMain.handle(IPC_CHANNELS.sessionKill, async (_event, payload: KillSessionRequest) => {
    return await controlPlane.killSession(payload);
  });
  ipcMain.handle(IPC_CHANNELS.sessionList, async () => {
    return controlPlane.listSessions();
  });
}
