import { app, ipcMain } from "electron";
import {
  IPC_CHANNELS,
  apiGatewayCheckProviderHealthRequestSchema,
  apiGatewaySaveConfigRequestSchema
} from "@localterm/shared";
import { apiGatewayService } from "../lib/api-gateway-service";

function getUserDataDir() {
  return app.getPath("userData");
}

export async function initializeApiGatewayService() {
  await apiGatewayService.initialize(getUserDataDir());
}

export function registerApiGatewayIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.apiGatewayGetConfig, async () => {
    return await apiGatewayService.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.apiGatewaySaveConfig, async (_event, payload) => {
    const request = apiGatewaySaveConfigRequestSchema.parse(payload);
    return await apiGatewayService.saveConfig(request);
  });

  ipcMain.handle(IPC_CHANNELS.apiGatewayGetStatus, async () => {
    return await apiGatewayService.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.apiGatewayStart, async () => {
    return await apiGatewayService.start();
  });

  ipcMain.handle(IPC_CHANNELS.apiGatewayStop, async () => {
    return await apiGatewayService.stop();
  });

  ipcMain.handle(IPC_CHANNELS.apiGatewayCheckProviderHealth, async (_event, payload) => {
    const request = apiGatewayCheckProviderHealthRequestSchema.parse(payload);
    return await apiGatewayService.checkProviderHealth(request.providerId);
  });
}
