import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeWorkspaceSnapshot,
  workspaceGetDefaultResponseSchema,
  workspaceIndexSchema,
  workspaceListResponseSchema,
  workspaceSnapshotSchema,
  type WorkspaceGetDefaultResponse,
  type WorkspaceListResponse
} from "@localterm/shared";

const STORE_ROOT_DIR = "workspace-store";
const SNAPSHOT_DIR = "workspaces";
const INDEX_FILE = "index.json";
const BUILTIN_WORKSPACE_EXTENSION_ID = "builtin.workspace";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function migrateLegacyTerminalTabDescriptor(descriptor: unknown): unknown {
  const descriptorRecord = toRecord(descriptor);
  if (!descriptorRecord) return descriptor;
  const widget = toRecord(descriptorRecord.widget);
  if (!widget || widget.kind !== "terminal.local") return descriptor;
  const input = toRecord(widget.input) ?? {};
  const cols = typeof input.cols === "number" && Number.isFinite(input.cols) ? Math.floor(input.cols) : 120;
  const rows = typeof input.rows === "number" && Number.isFinite(input.rows) ? Math.floor(input.rows) : 30;
  const startupScripts = Array.isArray(input.startupScripts) ? input.startupScripts : [];

  return {
    ...descriptorRecord,
    restorePolicy: "manual",
    widget: {
      kind: "extension.widget",
      input: {
        extensionId: BUILTIN_WORKSPACE_EXTENSION_ID,
        widgetId: "terminal.local",
        state: {
          cols,
          rows,
          startupScripts,
          sessionId: "",
          port: 0,
          pid: 0,
          status: "idle",
          wsConnected: false
        }
      }
    }
  };
}

function migrateLegacyTerminalSnapshotPayload(payload: unknown): unknown {
  const snapshotRecord = toRecord(payload);
  if (!snapshotRecord) return payload;
  if (!Array.isArray(snapshotRecord.tabs)) return payload;
  return {
    ...snapshotRecord,
    tabs: snapshotRecord.tabs.map((entry) => migrateLegacyTerminalTabDescriptor(entry))
  };
}

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

export async function saveWorkspaceSnapshot(userDataDir: string, payload: unknown) {
  const migrated = migrateLegacyTerminalSnapshotPayload(payload);
  const snapshot = normalizeWorkspaceSnapshot(workspaceSnapshotSchema.parse(migrated));
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
        ? { ...entry, name: snapshot.layout.name, lastAccessed: now, isClosed: false }
        : entry
    );
  } else {
    // New workspace: append to end
    nextWorkspaces = [
      ...current.workspaces,
      {
        id: snapshot.layout.id,
        name: snapshot.layout.name,
        lastAccessed: now,
        isClosed: false
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
  const migrated = migrateLegacyTerminalSnapshotPayload(JSON.parse(raw));
  const parsed = normalizeWorkspaceSnapshot(workspaceSnapshotSchema.parse(migrated));
  const index = await readIndex(userDataDir);
  const updated = {
    workspaces: index.workspaces.map((entry) =>
      entry.id === workspaceId
        ? { ...entry, lastAccessed: Date.now(), name: parsed.layout.name, isClosed: false }
        : entry
    )
  };
  await writeIndex(userDataDir, updated);
  return parsed;
}

export async function listWorkspaces(userDataDir: string) {
  return await readIndex(userDataDir);
}

export async function closeWorkspaceSnapshot(userDataDir: string, workspaceId: string) {
  const current = await readIndex(userDataDir);
  const nextWorkspaces = current.workspaces.map((entry) =>
    entry.id === workspaceId ? { ...entry, isClosed: true } : entry
  );
  await writeIndex(userDataDir, {
    workspaces: nextWorkspaces
  });
  return { ok: true } as const;
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
  const openWorkspaces = index.workspaces.filter((entry) => !entry.isClosed);
  if (openWorkspaces.length === 0) {
    return workspaceGetDefaultResponseSchema.parse({ workspace: null });
  }

  // Return the first open workspace that can be loaded.
  for (const entry of openWorkspaces) {
    try {
      const workspace = await loadWorkspaceSnapshot(userDataDir, entry.id);
      return workspaceGetDefaultResponseSchema.parse({ workspace });
    } catch {
      // try next workspace
    }
  }
  return workspaceGetDefaultResponseSchema.parse({ workspace: null });
}
