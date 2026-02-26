import { execFileSync } from "node:child_process";
import { readRegistrySnapshot, getRegistrySnapshotPath } from "@localterm/control-plane";

function isPidAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listWorkerCandidates() {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (!match) return null;
        return { pid: Number(match[1]), command: match[2] };
      })
      .filter((row): row is { pid: number; command: string } => !!row)
      .filter((row) => row.command.includes("session-worker/src/main.ts"));
  } catch {
    return [];
  }
}

const snapshot = readRegistrySnapshot();
const workers = listWorkerCandidates();

console.log(`Registry snapshot file: ${getRegistrySnapshotPath()}`);
if (!snapshot) {
  console.log("No registry snapshot found.");
} else {
  console.log("Registry snapshot:");
  console.log(
    JSON.stringify(
      {
        updatedAt: snapshot.updatedAt,
        sessions: snapshot.sessions.map((s) => ({
          ...s,
          pidAlive: isPidAlive(s.pid)
        }))
      },
      null,
      2
    )
  );
}

console.log("Worker process candidates (ps):");
console.log(JSON.stringify(workers, null, 2));

