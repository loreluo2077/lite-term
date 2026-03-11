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
  systemNotify: "system:notify",
  workspaceSave: "workspace:save",
  workspaceLoad: "workspace:load",
  workspaceList: "workspace:list",
  workspaceClose: "workspace:close",
  workspaceDelete: "workspace:delete",
  workspaceGetDefault: "workspace:getDefault",
  workspaceGlobalLibraryGet: "workspace:globalLibrary:get",
  workspaceGlobalLibrarySet: "workspace:globalLibrary:set",
  workspaceGlobalLibraryRemove: "workspace:globalLibrary:remove",
  workspaceStorageInfo: "workspace:storageInfo",
  apiGatewayGetConfig: "apiGateway:getConfig",
  apiGatewaySaveConfig: "apiGateway:saveConfig",
  apiGatewayGetStatus: "apiGateway:getStatus",
  apiGatewayStart: "apiGateway:start",
  apiGatewayStop: "apiGateway:stop",
  apiGatewayCheckProviderHealth: "apiGateway:checkProviderHealth",
  widgetRegistrySave: "widgetRegistry:save",
  widgetRegistryLoad: "widgetRegistry:load",
  extensionGetHostConfig: "extension:getHostConfig",
  filePickDirectory: "file:pickDirectory",
  filePickFile: "file:pickFile",
  fileReadDir: "file:readDir",
  fileReadFile: "file:readFile",
  agentConfigsList: "agentConfigs:list",
  agentConfigsReadFile: "agentConfigs:readFile",
  agentConfigsWriteFile: "agentConfigs:writeFile",
  agentConfigsRevealPath: "agentConfigs:revealPath",
  gitReadDiff: "git:readDiff"
} as const;

export const DEFAULTS = {
  workerHost: "127.0.0.1",
  minPort: 39000,
  maxPort: 49999
} as const;
