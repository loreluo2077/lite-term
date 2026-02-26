/**
 * Generic per-session child process entry.
 * Phase 1 supports sessionType=local only, but worker shell remains generic.
 */
import process from "node:process";
import { WebSocketServer, type WebSocket } from "ws";
import {
  type WorkerChildToParentMessage,
  type WorkerParentToChildMessage,
  workerBootstrapMessageSchema,
  workerParentToChildMessageSchema,
  workerResizeMessageSchema
} from "@localterm/shared";
import { LocalSessionAdapter } from "@localterm/session-local";

type RuntimeState = {
  sessionId: string;
  port: number;
  host: string;
  server: WebSocketServer;
  adapter: LocalSessionAdapter;
  ready: boolean;
  exited: boolean;
  activeSocket: WebSocket | null;
};

let runtime: RuntimeState | null = null;
let shuttingDown = false;

function sendParent(msg: WorkerChildToParentMessage) {
  if (typeof process.send === "function") {
    process.send(msg);
  }
}

function sendSocketEvent(event: object) {
  if (!runtime?.activeSocket || runtime.activeSocket.readyState !== runtime.activeSocket.OPEN) {
    return;
  }
  runtime.activeSocket.send(JSON.stringify(event));
}

function closeServer() {
  const server = runtime?.server;
  if (!server) return;
  try {
    server.clients.forEach((client) => client.close());
    server.close();
  } catch {
    // ignore shutdown noise
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    runtime?.adapter.kill();
  } catch {
    // ignore
  }
  closeServer();
  setTimeout(() => process.exit(exitCode), 10);
}

async function initRuntime(message: unknown) {
  const parsed = workerBootstrapMessageSchema.safeParse(message);
  if (!parsed.success) {
    sendParent({
      type: "worker:error",
      payload: {
        sessionId: "unknown",
        message: parsed.error.message
      }
    });
    return shutdown(1);
  }
  const { sessionId, port, host, request } = parsed.data.payload;

  const adapter = new LocalSessionAdapter(request);
  const server = new WebSocketServer({ host, port });

  runtime = {
    sessionId,
    port,
    host,
    server,
    adapter,
    ready: false,
    exited: false,
    activeSocket: null
  };

  server.on("connection", (socket) => {
    runtime!.activeSocket = socket;

    if (runtime?.ready) {
      sendSocketEvent({
        type: "ready",
        sessionId,
        pid: process.pid,
        port
      });
    }

    socket.on("message", (data, isBinary) => {
      if (!runtime) return;
      try {
        if (isBinary) {
          runtime.adapter.write(new Uint8Array(data as Buffer));
        } else {
          runtime.adapter.write(String(data));
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        sendSocketEvent({
          type: "error",
          sessionId,
          message: err.message
        });
      }
    });

    socket.on("close", () => {
      if (runtime?.activeSocket === socket) {
        runtime.activeSocket = null;
      }
    });
  });

  adapter.onData((data) => {
    if (!runtime?.activeSocket || runtime.activeSocket.readyState !== runtime.activeSocket.OPEN) return;
    runtime.activeSocket.send(Buffer.from(data));
  });

  adapter.onError((error) => {
    sendParent({
      type: "worker:error",
      payload: {
        sessionId,
        message: error.message
      }
    });
    sendSocketEvent({
      type: "error",
      sessionId,
      message: error.message
    });
  });

  adapter.onExit((info) => {
    if (!runtime || runtime.exited) return;
    runtime.exited = true;
    sendSocketEvent({
      type: "exit",
      sessionId,
      exitCode: info.exitCode ?? null,
      signal: info.signal
    });
    shutdown(0);
  });

  await adapter.init();

  runtime.ready = true;
  sendParent({
    type: "worker:ready",
    payload: {
      sessionId,
      port,
      pid: process.pid
    }
  });
}

function onParentMessage(message: unknown) {
  const parsed = workerParentToChildMessageSchema.safeParse(message);
  if (!parsed.success) {
    if (runtime) {
      sendParent({
        type: "worker:error",
        payload: {
          sessionId: runtime.sessionId,
          message: parsed.error.message
        }
      });
    }
    return;
  }

  const msg: WorkerParentToChildMessage = parsed.data;
  if (msg.type === "worker:init") {
    if (runtime) return;
    void initRuntime(msg).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      sendParent({
        type: "worker:error",
        payload: {
          sessionId: "unknown",
          message: err.message
        }
      });
      shutdown(1);
    });
    return;
  }

  if (!runtime) return;

  if (msg.type === "worker:resize") {
    const { cols, rows } = workerResizeMessageSchema.parse(msg).payload;
    runtime.adapter.resize(cols, rows);
    return;
  }

  if (msg.type === "worker:kill") {
    shutdown(0);
  }
}

export function bootstrapSessionWorker() {
  process.on("message", onParentMessage);
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
  process.on("uncaughtException", (error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    if (runtime) {
      sendParent({
        type: "worker:error",
        payload: {
          sessionId: runtime.sessionId,
          message: err.message
        }
      });
    }
    shutdown(1);
  });
}

if (process.argv[1] && process.argv[1].includes("main.ts")) {
  bootstrapSessionWorker();
}
