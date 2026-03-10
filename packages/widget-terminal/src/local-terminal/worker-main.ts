/**
 * Generic per-session child process entry for local terminal widget.
 */
import process from "node:process";
import { WebSocketServer, type WebSocket } from "ws";
import {
  type SessionWorkerControlEvent,
  type WorkerChildToParentMessage,
  type WorkerParentToChildMessage,
  workerBootstrapMessageSchema,
  workerParentToChildMessageSchema,
  workerResizeMessageSchema
} from "@localterm/shared";
import { LocalSessionAdapter } from "./local-session-adapter";
import { StartupScriptRunner } from "./startup-script-runner";

type RuntimeState = {
  sessionId: string;
  port: number;
  host: string;
  server: WebSocketServer;
  adapter: LocalSessionAdapter;
  startupScriptRunner: StartupScriptRunner;
  ready: boolean;
  exited: boolean;
  sockets: Set<WebSocket>;
  replayableEvents: SessionWorkerControlEvent[];
};

let runtime: RuntimeState | null = null;
let shuttingDown = false;

function sendParent(msg: WorkerChildToParentMessage) {
  if (typeof process.send === "function") {
    process.send(msg);
  }
}

function broadcastSocketEvent(event: SessionWorkerControlEvent) {
  if (!runtime) return;
  const serialized = JSON.stringify(event);
  for (const socket of runtime.sockets) {
    if (socket.readyState !== socket.OPEN) continue;
    socket.send(serialized);
  }
}

function sendSocketEvent(socket: WebSocket, event: SessionWorkerControlEvent) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(event));
}

function emitControlEvent(event: SessionWorkerControlEvent) {
  if (runtime && event.type !== "ready" && event.type !== "exit") {
    runtime.replayableEvents = runtime.replayableEvents.filter((entry) => entry.type !== event.type);
    runtime.replayableEvents.push(event);
  }
  broadcastSocketEvent(event);
}

function broadcastSocketOutput(chunk: Uint8Array) {
  if (!runtime) return;
  const payload = Buffer.from(chunk);
  for (const socket of runtime.sockets) {
    if (socket.readyState !== socket.OPEN) continue;
    socket.send(payload);
  }
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

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket server failed to start on ${host}:${port}`));
    }, 5000);

    server.once("listening", () => {
      clearTimeout(timeout);
      resolve();
    });

    server.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const startupScriptRunner = new StartupScriptRunner({
    sessionId,
    scripts: request.startupScripts ?? [],
    write: (data) => {
      adapter.write(data);
    },
    emitControl: (event) => {
      emitControlEvent(event);
    }
  });

  runtime = {
    sessionId,
    port,
    host,
    server,
    adapter,
    startupScriptRunner,
    ready: false,
    exited: false,
    sockets: new Set(),
    replayableEvents: []
  };

  server.on("connection", (socket) => {
    runtime?.sockets.add(socket);

    if (runtime?.ready) {
      sendSocketEvent(socket, {
        type: "ready",
        sessionId,
        pid: process.pid,
        port
      });
      for (const event of runtime.replayableEvents) {
        sendSocketEvent(socket, event);
      }
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
        emitControlEvent({
          type: "error",
          sessionId,
          message: err.message
        });
      }
    });

    socket.on("close", () => {
      runtime?.sockets.delete(socket);
    });
  });

  adapter.onData((data) => {
    broadcastSocketOutput(data);
    startupScriptRunner.onOutput(data);
  });

  adapter.onError((error) => {
    sendParent({
      type: "worker:error",
      payload: {
        sessionId,
        message: error.message
      }
    });
    emitControlEvent({
      type: "error",
      sessionId,
      message: error.message
    });
  });

  adapter.onExit((info) => {
    if (!runtime || runtime.exited) return;
    runtime.exited = true;
    runtime.startupScriptRunner.dispose();
    broadcastSocketEvent({
      type: "exit",
      sessionId,
      exitCode: info.exitCode ?? null,
      signal: info.signal
    });
    shutdown(0);
  });

  await adapter.init();
  startupScriptRunner.start();

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

export function bootstrapLocalTerminalWidgetWorker() {
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

bootstrapLocalTerminalWidgetWorker();
