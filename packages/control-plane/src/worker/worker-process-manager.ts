/**
 * Starts/stops per-session child workers.
 * Owns process lifecycle, but not terminal protocol/data forwarding.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  type CreateLocalSessionRequest,
  type WorkerChildToParentMessage,
  type WorkerParentToChildMessage,
  workerChildToParentMessageSchema
} from "@localterm/shared";

export type SpawnWorkerInput = {
  sessionId: string;
  port: number;
  host: string;
  request: CreateLocalSessionRequest;
};

export type ManagedWorker = {
  child: ChildProcess;
  sessionId: string;
  port: number;
};

export class WorkerProcessManager {
  private readonly workers = new Map<string, ManagedWorker>();

  private resolveWorkerEntry(): string {
    return fileURLToPath(new URL("../../../session-worker/src/main.ts", import.meta.url));
  }

  async spawnLocalSessionWorker(input: SpawnWorkerInput): Promise<{
    worker: ManagedWorker;
    ready: { pid: number; port: number };
  }> {
    const entry = this.resolveWorkerEntry();
    const child = spawn(process.execPath, ["--import", "tsx", entry], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      }
    });

    if (!child.pid) {
      throw new Error("Failed to spawn session worker");
    }

    const worker: ManagedWorker = {
      child,
      sessionId: input.sessionId,
      port: input.port
    };
    this.workers.set(input.sessionId, worker);

    const ready = await new Promise<{ pid: number; port: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for worker ready: ${input.sessionId}`));
      }, 10_000);

      const cleanup = () => {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("error", onError);
        child.off("exit", onExit);
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(new Error(`Worker exited before ready (code=${code}, signal=${signal})`));
      };

      const onMessage = (raw: unknown) => {
        const parsed = workerChildToParentMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const msg: WorkerChildToParentMessage = parsed.data;
        if (msg.type === "worker:error") {
          cleanup();
          reject(new Error(msg.payload.message));
          return;
        }
        if (msg.type === "worker:ready") {
          cleanup();
          resolve({
            pid: msg.payload.pid,
            port: msg.payload.port
          });
        }
      };

      child.on("message", onMessage);
      child.on("error", onError);
      child.on("exit", onExit);

      const initMsg: WorkerParentToChildMessage = {
        type: "worker:init",
        payload: input
      };
      child.send(initMsg);
    });

    child.on("exit", () => {
      this.workers.delete(input.sessionId);
    });

    return { worker, ready };
  }

  getWorker(sessionId: string) {
    return this.workers.get(sessionId);
  }

  async sendResize(sessionId: string, cols: number, rows: number) {
    const worker = this.workers.get(sessionId);
    if (!worker) throw new Error(`Session worker not found: ${sessionId}`);
    worker.child.send({
      type: "worker:resize",
      payload: { cols, rows }
    } satisfies WorkerParentToChildMessage);
  }

  async killSessionWorker(sessionId: string) {
    const worker = this.workers.get(sessionId);
    if (!worker) return;
    worker.child.send({ type: "worker:kill" } satisfies WorkerParentToChildMessage);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        worker.child.kill("SIGKILL");
        resolve();
      }, 2_000);
      worker.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  listWorkers() {
    return Array.from(this.workers.values()).map((w) => ({
      sessionId: w.sessionId,
      pid: w.child.pid ?? -1,
      port: w.port
    }));
  }
}
