/**
 * IPC handlers forward session control requests to control-plane.
 * They should remain thin and type-driven.
 */
import { execFileSync } from "node:child_process";
import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  systemMetricsResponseSchema,
  type CreateLocalSessionRequest,
  type KillSessionRequest,
  type ResizeSessionRequest
} from "@localterm/shared";
import { getControlPlaneService } from "@localterm/control-plane";

function sampleRssByPid(pids: number[]) {
  if (pids.length === 0) return new Map<number, number>();
  try {
    const out = execFileSync("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], {
      encoding: "utf8"
    });
    const map = new Map<number, number>();
    for (const line of out.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!match) continue;
      map.set(Number(match[1]), Number(match[2]));
    }
    return map;
  } catch {
    return new Map<number, number>();
  }
}

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
  ipcMain.handle(IPC_CHANNELS.systemMetrics, async () => {
    const listed = controlPlane.listSessions().sessions;
    const pids = listed
      .map((s) => s.pid)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
    const rssByPid = sampleRssByPid(pids);
    const workers = listed.map((s) => ({
      sessionId: s.sessionId,
      pid: s.pid,
      status: s.status,
      rssKb: rssByPid.get(s.pid) ?? null
    }));
    const workersTotalRssKb = workers.reduce((sum, w) => sum + (w.rssKb ?? 0), 0);
    return systemMetricsResponseSchema.parse({
      timestamp: new Date().toISOString(),
      main: {
        pid: process.pid,
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external
      },
      workers,
      workersTotalRssKb
    });
  });
}
