import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  gitReadDiffRequestSchema
} from "@localterm/shared";
import { readGitDiffForPath } from "../lib/git-diff";

export function registerGitIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.gitReadDiff, async (_event, payload) => {
    const request = gitReadDiffRequestSchema.parse(payload);
    return await readGitDiffForPath(request);
  });
}
