import fs from "node:fs/promises";
import path from "node:path";
import {
  workspaceGetDefaultResponseSchema,
  workspaceIndexSchema,
  workspaceListResponseSchema,
  workspaceSnapshotSchema,
  type WorkspaceGetDefaultResponse,
  type WorkspaceListResponse,
  type WorkspaceSnapshot
} from "@localterm/shared";

const STORE_ROOT_DIR = "workspace-store";
const SNAPSHOT_DIR = "workspaces";
const INDEX_FILE = "index.json";

function ensureSafeWorkspaceId(id: string) {
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error(`invalid workspace id: ${id}`);
  }
}

function getStoreRoot(userDataDir: string) {
  return path.join(userDataDir, STORE_ROOT_DIR);
}

function getSnapshotRoot(userDataDir: string) {
  return path.join(getStoreRoot(userDataDir), SNAPSHOT_DIR);
}

function getIndexPath(userDataDir: string) {
  return path.join(getStoreRoot(userDataDir), INDEX_FILE);
}

function getSnapshotPath(userDataDir: string, workspaceId: string) {
  ensureSafeWorkspaceId(workspaceId);
  return path.join(getSnapshotRoot(userDataDir), `${workspaceId}.json`);
}

async function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

async function ensureStore(userDataDir: string) {
  await fs.mkdir(getSnapshotRoot(userDataDir), { recursive: true });
}

async function readIndex(userDataDir: string): Promise<WorkspaceListResponse> {
  await ensureStore(userDataDir);
  const indexPath = getIndexPath(userDataDir);
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    return workspaceListResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return {
        workspaces: []
      };
    }
    throw error;
  }
}

async function writeIndex(userDataDir: string, index: WorkspaceListResponse) {
  await ensureStore(userDataDir);
  const parsed = workspaceIndexSchema.parse(index);
  await writeFileAtomic(getIndexPath(userDataDir), JSON.stringify(parsed, null, 2));
}

export async function saveWorkspaceSnapshot(userDataDir: string, payload: WorkspaceSnapshot) {
  const snapshot = workspaceSnapshotSchema.parse(payload);
  await ensureStore(userDataDir);
  await writeFileAtomic(
    getSnapshotPath(userDataDir, snapshot.layout.id),
    JSON.stringify(snapshot, null, 2)
  );

  const now = Date.now();
  const current = await readIndex(userDataDir);

  // Check if workspace already exists
  const existingIndex = current.workspaces.findIndex((entry) => entry.id === snapshot.layout.id);

  let nextWorkspaces: typeof current.workspaces;
  if (existingIndex >= 0) {
    // Update existing workspace in place (preserve order)
    nextWorkspaces = current.workspaces.map((entry) =>
      entry.id === snapshot.layout.id
        ? { ...entry, name: snapshot.layout.name, lastAccessed: now }
        : entry
    );
  } else {
    // New workspace: append to end
    nextWorkspaces = [
      ...current.workspaces,
      {
        id: snapshot.layout.id,
        name: snapshot.layout.name,
        lastAccessed: now
      }
    ];
  }

  const nextIndex = {
    workspaces: nextWorkspaces
  };
  await writeIndex(userDataDir, nextIndex);
  return { ok: true } as const;
}

export async function loadWorkspaceSnapshot(userDataDir: string, workspaceId: string) {
  const filePath = getSnapshotPath(userDataDir, workspaceId);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = workspaceSnapshotSchema.parse(JSON.parse(raw));
  const index = await readIndex(userDataDir);
  const updated = {
    workspaces: index.workspaces.map((entry) =>
      entry.id === workspaceId ? { ...entry, lastAccessed: Date.now(), name: parsed.layout.name } : entry
    )
  };
  await writeIndex(userDataDir, updated);
  return parsed;
}

export async function listWorkspaces(userDataDir: string) {
  return await readIndex(userDataDir);
}

export async function deleteWorkspaceSnapshot(userDataDir: string, workspaceId: string) {
  const filePath = getSnapshotPath(userDataDir, workspaceId);
  await fs.rm(filePath, { force: true });

  const current = await readIndex(userDataDir);
  const nextWorkspaces = current.workspaces.filter((entry) => entry.id !== workspaceId);
  await writeIndex(userDataDir, {
    workspaces: nextWorkspaces
  });
  return { ok: true } as const;
}

export async function getDefaultWorkspaceSnapshot(userDataDir: string): Promise<WorkspaceGetDefaultResponse> {
  const index = await readIndex(userDataDir);
  if (index.workspaces.length === 0) {
    return workspaceGetDefaultResponseSchema.parse({ workspace: null });
  }
  // Return the first workspace as a fallback
  const firstWorkspaceId = index.workspaces[0]?.id;
  if (!firstWorkspaceId) {
    return workspaceGetDefaultResponseSchema.parse({ workspace: null });
  }
  try {
    const workspace = await loadWorkspaceSnapshot(userDataDir, firstWorkspaceId);
    return workspaceGetDefaultResponseSchema.parse({ workspace });
  } catch {
    return workspaceGetDefaultResponseSchema.parse({ workspace: null });
  }
}
