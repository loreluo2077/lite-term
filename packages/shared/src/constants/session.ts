export const SESSION_TYPES = ["local"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_STATUSES = [
  "starting",
  "ready",
  "exited",
  "error"
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const IPC_CHANNELS = {
  sessionCreateLocal: "session:createLocal",
  sessionResize: "session:resize",
  sessionKill: "session:kill",
  sessionList: "session:list",
  systemMetrics: "system:getMetrics",
  workspaceSave: "workspace:save",
  workspaceLoad: "workspace:load",
  workspaceList: "workspace:list",
  workspaceClose: "workspace:close",
  workspaceDelete: "workspace:delete",
  workspaceGetDefault: "workspace:getDefault",
  filePickDirectory: "file:pickDirectory",
  filePickFile: "file:pickFile",
  fileReadDir: "file:readDir",
  fileReadFile: "file:readFile"
} as const;

export const DEFAULTS = {
  workerHost: "127.0.0.1",
  minPort: 39000,
  maxPort: 49999
} as const;
