import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SessionRegistryRecord } from "../registry/session-registry";

export type SessionRegistrySnapshot = {
  updatedAt: string;
  sessions: SessionRegistryRecord[];
};

export function getRegistrySnapshotPath() {
  return path.join(os.tmpdir(), "localterm-session-registry.json");
}

export function writeRegistrySnapshot(records: SessionRegistryRecord[]) {
  const payload: SessionRegistrySnapshot = {
    updatedAt: new Date().toISOString(),
    sessions: records
  };
  fs.writeFileSync(getRegistrySnapshotPath(), JSON.stringify(payload, null, 2), "utf8");
}

export function readRegistrySnapshot(): SessionRegistrySnapshot | null {
  const p = getRegistrySnapshotPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as SessionRegistrySnapshot;
  } catch {
    return null;
  }
}

