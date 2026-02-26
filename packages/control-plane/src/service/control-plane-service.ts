/**
 * Public service used by Electron IPC handlers.
 * This is the control-plane entrypoint for session lifecycle operations.
 */
import { randomUUID } from "node:crypto";
import {
  DEFAULTS,
  createLocalSessionRequestSchema,
  createLocalSessionResponseSchema,
  killSessionRequestSchema,
  listSessionsResponseSchema,
  okResponseSchema,
  resizeSessionRequestSchema,
  type CreateLocalSessionRequest,
  type CreateLocalSessionResponse,
  type KillSessionRequest,
  type ListSessionsResponse,
  type OkResponse,
  type ResizeSessionRequest
} from "@localterm/shared";
import { PortAllocator } from "../port/port-allocator";
import { SessionRegistry } from "../registry/session-registry";
import { WorkerProcessManager } from "../worker/worker-process-manager";
import { writeRegistrySnapshot } from "../debug/registry-snapshot";

export class ControlPlaneService {
  constructor(
    private readonly registry = new SessionRegistry(),
    private readonly ports = new PortAllocator(),
    private readonly workers = new WorkerProcessManager()
  ) {}

  private syncSnapshot() {
    writeRegistrySnapshot(this.registry.list());
  }

  async createLocalSession(input: unknown): Promise<CreateLocalSessionResponse> {
    const request = createLocalSessionRequestSchema.parse(input);
    const sessionId = randomUUID();
    const port = await this.ports.allocate(DEFAULTS.workerHost);

    this.registry.set({
      sessionId,
      pid: -1,
      port,
      status: "starting"
    });
    this.syncSnapshot();

    try {
      const { worker, ready } = await this.workers.spawnLocalSessionWorker({
        sessionId,
        port,
        host: DEFAULTS.workerHost,
        request
      });

      this.registry.set({
        sessionId,
        pid: ready.pid || worker.child.pid || -1,
        port,
        status: "ready"
      });
      this.syncSnapshot();

      worker.child.on("exit", () => {
        this.registry.update(sessionId, { status: "exited" });
        this.syncSnapshot();
      });

      worker.child.on("message", (raw) => {
        if (!raw || typeof raw !== "object") return;
        const msg = raw as { type?: string; payload?: { message?: string } };
        if (msg.type === "worker:error") {
          this.registry.update(sessionId, {
            status: "error",
            lastError: msg.payload?.message ?? "worker error"
          });
          this.syncSnapshot();
        }
      });

      return createLocalSessionResponseSchema.parse({
        sessionId,
        port,
        pid: ready.pid || worker.child.pid || -1,
        status: "ready"
      });
    } catch (error) {
      this.registry.update(sessionId, {
        status: "error",
        lastError: error instanceof Error ? error.message : String(error)
      });
      this.syncSnapshot();
      throw error;
    }
  }

  async resizeSession(input: unknown): Promise<OkResponse> {
    const req = resizeSessionRequestSchema.parse(input);
    await this.workers.sendResize(req.sessionId, req.cols, req.rows);
    return okResponseSchema.parse({ ok: true });
  }

  async killSession(input: unknown): Promise<OkResponse> {
    const req = killSessionRequestSchema.parse(input);
    await this.workers.killSessionWorker(req.sessionId);
    this.registry.update(req.sessionId, { status: "exited" });
    this.syncSnapshot();
    return okResponseSchema.parse({ ok: true });
  }

  listSessions(): ListSessionsResponse {
    return listSessionsResponseSchema.parse({
      sessions: this.registry.list().map((session) => ({
        sessionId: session.sessionId,
        pid: session.pid,
        port: session.port,
        status: session.status
      }))
    });
  }

  getRegistry() {
    return this.registry;
  }
}

let singleton: ControlPlaneService | null = null;

export function getControlPlaneService() {
  singleton ??= new ControlPlaneService();
  return singleton;
}
