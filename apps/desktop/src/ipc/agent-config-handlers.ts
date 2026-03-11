import fs from "node:fs/promises";
import { ipcMain, shell } from "electron";
import {
  IPC_CHANNELS,
  agentConfigListRequestSchema,
  agentConfigReadFileRequestSchema,
  agentConfigRevealPathRequestSchema,
  agentConfigWriteFileRequestSchema
} from "@localterm/shared";
import {
  listAgentConfigSnapshots,
  readAgentConfigFile,
  writeAgentConfigFile
} from "../lib/agent-configs";

export function registerAgentConfigIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.agentConfigsList, async (_event, payload) => {
    const request = agentConfigListRequestSchema.parse(payload ?? {});
    return await listAgentConfigSnapshots({
      workspaceRootPath: request.workspaceRootPath ?? null
    });
  });

  ipcMain.handle(IPC_CHANNELS.agentConfigsReadFile, async (_event, payload) => {
    const request = agentConfigReadFileRequestSchema.parse(payload);
    return await readAgentConfigFile(request.path);
  });

  ipcMain.handle(IPC_CHANNELS.agentConfigsWriteFile, async (_event, payload) => {
    const request = agentConfigWriteFileRequestSchema.parse(payload);
    return await writeAgentConfigFile(request.path, request.content);
  });

  ipcMain.handle(IPC_CHANNELS.agentConfigsRevealPath, async (_event, payload) => {
    const request = agentConfigRevealPathRequestSchema.parse(payload);
    const stat = await fs.stat(request.path).catch((error: NodeJS.ErrnoException) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) {
      throw new Error(`path does not exist: ${request.path}`);
    }
    if (stat.isDirectory()) {
      const maybeError = await shell.openPath(request.path);
      if (maybeError) {
        throw new Error(maybeError);
      }
      return { ok: true } as const;
    }
    shell.showItemInFolder(request.path);
    return { ok: true } as const;
  });
}
