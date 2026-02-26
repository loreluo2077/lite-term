import { execFileSync } from "node:child_process";
import { readRegistrySnapshot } from "@localterm/control-plane";

function listWorkerCandidates() {
  const out = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(.+)$/);
      if (!m) return null;
      return { pid: Number(m[1]), command: m[2] };
    })
    .filter((row): row is { pid: number; command: string } => !!row)
    .filter((row) => row.command.includes("session-worker/src/main.ts"));
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const snapshot = readRegistrySnapshot();
const keepPids = new Set(
  (snapshot?.sessions ?? [])
    .map((s) => s.pid)
    .filter((pid) => Number.isInteger(pid) && pid > 0 && isPidAlive(pid))
);

const candidates = listWorkerCandidates();
const orphans = candidates.filter((c) => !keepPids.has(c.pid));

console.log(JSON.stringify({ keepPids: [...keepPids], orphans }, null, 2));

for (const orphan of orphans) {
  try {
    process.kill(orphan.pid, "SIGTERM");
    console.log(`SIGTERM ${orphan.pid}`);
  } catch (e) {
    console.warn(`Failed to SIGTERM ${orphan.pid}:`, e);
  }
}

