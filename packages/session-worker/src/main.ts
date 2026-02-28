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
  pendingOutput: Uint8Array[];
  pendingOutputBytes: number;
  disconnectTimer: NodeJS.Timeout | null;
};

let runtime: RuntimeState | null = null;
let shuttingDown = false;
const MAX_PENDING_OUTPUT_BYTES = 256 * 1024;

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

function enqueuePendingOutput(chunk: Uint8Array) {
  if (!runtime) return;
  runtime.pendingOutput.push(chunk);
  runtime.pendingOutputBytes += chunk.byteLength;

  // Trim oldest chunks to keep memory bounded when no client is attached.
  while (runtime.pendingOutputBytes > MAX_PENDING_OUTPUT_BYTES && runtime.pendingOutput.length > 0) {
    const removed = runtime.pendingOutput.shift();
    if (removed) runtime.pendingOutputBytes -= removed.byteLength;
  }
}

function sendSocketOutput(chunk: Uint8Array) {
  if (!runtime?.activeSocket || runtime.activeSocket.readyState !== runtime.activeSocket.OPEN) {
    enqueuePendingOutput(chunk);
    return;
  }
  runtime.activeSocket.send(Buffer.from(chunk));
}

function flushPendingOutput() {
  if (!runtime?.activeSocket || runtime.activeSocket.readyState !== runtime.activeSocket.OPEN) return;
  for (const chunk of runtime.pendingOutput) {
    runtime.activeSocket.send(Buffer.from(chunk));
  }
  runtime.pendingOutput = [];
  runtime.pendingOutputBytes = 0;
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

  console.log(`[worker:${sessionId.slice(0, 8)}] Initializing on ${host}:${port}`);

  const adapter = new LocalSessionAdapter(request);
  const server = new WebSocketServer({ host, port });

  // Wait for server to actually start listening before continuing.
  // This prevents race conditions on Windows where the renderer might try to
  // connect before the server is ready (electerm also waits for server.listen).
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error(`[worker:${sessionId.slice(0, 8)}] TIMEOUT: Server failed to listen on ${host}:${port} within 5s`);
      reject(new Error(`WebSocket server failed to start on ${host}:${port}`));
    }, 5000);

    server.once("listening", () => {
      clearTimeout(timeout);
      const addr = server.address();
      console.log(`[worker:${sessionId.slice(0, 8)}] Server listening on`, addr);
      resolve();
    });

    server.once("error", (err) => {
      clearTimeout(timeout);
      console.error(`[worker:${sessionId.slice(0, 8)}] Server error:`, err);
      reject(err);
    });
  });

  runtime = {
    sessionId,
    port,
    host,
    server,
    adapter,
    ready: false,
    exited: false,
    activeSocket: null,
    pendingOutput: [],
    pendingOutputBytes: 0,
    disconnectTimer: null
  };

  server.on("connection", (socket) => {
    console.log(`[worker:${sessionId.slice(0, 8)}] Client connected`);
    runtime!.activeSocket = socket;
    flushPendingOutput();

    // Cancel disconnect timer when client reconnects
    if (runtime?.disconnectTimer) {
      clearTimeout(runtime.disconnectTimer);
      runtime.disconnectTimer = null;
    }

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
      // Start a disconnect timer. If no client reconnects within 30 seconds,
      // assume the tab was closed and kill the session to avoid orphaned processes.
      // This supports renderer-side reconnect while preventing process leaks.
      if (runtime && !runtime.exited && !runtime.disconnectTimer) {
        runtime.disconnectTimer = setTimeout(() => {
          if (!runtime?.activeSocket) {
            shutdown(0);
          }
        }, 30_000);
      }
    });
  });

  adapter.onData((data) => {
    sendSocketOutput(data);
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
  console.log(`[worker:${sessionId.slice(0, 8)}] Sending ready signal - port=${port}, pid=${process.pid}`);
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
  console.log(`[worker] Bootstrap started, PID=${process.pid}`);
  console.log(`[worker] argv[0]=${process.argv[0]}`);
  console.log(`[worker] argv[1]=${process.argv[1]}`);

  process.on("message", onParentMessage);
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
  process.on("uncaughtException", (error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[worker] Uncaught exception:`, error);
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

// Unconditionally start bootstrap - this file's sole purpose is to be a worker entry point
// The conditional check (process.argv[1].includes("main.ts")) was failing with tsx
bootstrapSessionWorker();
