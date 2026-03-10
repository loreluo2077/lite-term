import fs from "node:fs/promises";
import path from "node:path";
import {
  workspaceGlobalLibraryGetResponseSchema,
  workspaceGlobalLibraryKeySchema,
  type WorkspaceGlobalLibraryKey,
  type WorkspaceStorageInfoResponse
} from "@localterm/shared";

const STORE_ROOT_DIR = "workspace-store";
const GLOBAL_LIBRARY_DIR = "global";

const GLOBAL_LIBRARY_FILES: Record<WorkspaceGlobalLibraryKey, string> = {
  "command-snippets": "command-snippets.json",
  "todos": "todos.json",
  "terminal-startup-presets": "terminal-startup-presets.json"
};

function getStoreRoot(userDataDir: string) {
  return path.join(userDataDir, STORE_ROOT_DIR);
}

function getGlobalLibraryDir(userDataDir: string) {
  return path.join(getStoreRoot(userDataDir), GLOBAL_LIBRARY_DIR);
}

function getGlobalLibraryPath(userDataDir: string, key: WorkspaceGlobalLibraryKey) {
  return path.join(getGlobalLibraryDir(userDataDir), GLOBAL_LIBRARY_FILES[key]);
}

async function ensureGlobalLibraryDir(userDataDir: string) {
  await fs.mkdir(getGlobalLibraryDir(userDataDir), { recursive: true });
}

async function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function readGlobalLibrary(userDataDir: string, rawKey: unknown) {
  const key = workspaceGlobalLibraryKeySchema.parse(rawKey);
  await ensureGlobalLibraryDir(userDataDir);
  const filePath = getGlobalLibraryPath(userDataDir, key);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return workspaceGlobalLibraryGetResponseSchema.parse({
      value: JSON.parse(raw)
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return workspaceGlobalLibraryGetResponseSchema.parse({ value: null });
    }
    throw error;
  }
}

export async function writeGlobalLibrary(userDataDir: string, rawKey: unknown, value: unknown) {
  const key = workspaceGlobalLibraryKeySchema.parse(rawKey);
  await ensureGlobalLibraryDir(userDataDir);
  const filePath = getGlobalLibraryPath(userDataDir, key);
  await writeFileAtomic(filePath, JSON.stringify(value ?? null, null, 2));
  return { ok: true } as const;
}

export async function removeGlobalLibrary(userDataDir: string, rawKey: unknown) {
  const key = workspaceGlobalLibraryKeySchema.parse(rawKey);
  await ensureGlobalLibraryDir(userDataDir);
  const filePath = getGlobalLibraryPath(userDataDir, key);
  await fs.rm(filePath, { force: true });
  return { ok: true } as const;
}

export function getWorkspaceStorageInfo(userDataDir: string): WorkspaceStorageInfoResponse {
  const storeRoot = getStoreRoot(userDataDir);
  const globalLibraryDir = getGlobalLibraryDir(userDataDir);
  return {
    userDataDir,
    storeRoot,
    workspaceIndexPath: path.join(storeRoot, "index.json"),
    widgetRegistryPath: path.join(storeRoot, "widget-registry.json"),
    globalLibraryDir,
    commandSnippetsPath: getGlobalLibraryPath(userDataDir, "command-snippets"),
    todosPath: getGlobalLibraryPath(userDataDir, "todos"),
    terminalStartupPresetsPath: getGlobalLibraryPath(userDataDir, "terminal-startup-presets")
  };
}
