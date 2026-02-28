/**
 * Renderer-side session WS connector (data plane).
 * One terminal tab connects to one worker-owned WS endpoint.
 */
import {
  sessionWorkerControlEventSchema,
  type SessionWorkerControlEvent
} from "@localterm/shared";

type Handlers = {
  onOpen?: () => void;
  onOutput?: (text: string) => void;
  onControlEvent?: (event: SessionWorkerControlEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

export function connectSessionWebSocket(port: number, handlers: Handlers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const decoder = new TextDecoder();

  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    console.log(`[ws] connected to port ${port}`);
    handlers.onOpen?.();
  });
  ws.addEventListener("close", (event) => {
    console.log(`[ws] closed port ${port}, code=${event.code}, reason=${event.reason || '(none)'}`);
    handlers.onClose?.();
  });
  ws.addEventListener("error", (event) => {
    console.error(`[ws] error on port ${port}`, event);
    handlers.onError?.(new Error(`WebSocket error on port ${port}`));
  });
  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      try {
        const parsed = sessionWorkerControlEventSchema.parse(JSON.parse(event.data));
        handlers.onControlEvent?.(parsed);
        return;
      } catch {
        handlers.onOutput?.(event.data);
        return;
      }
    }
    if (event.data instanceof ArrayBuffer) {
      handlers.onOutput?.(decoder.decode(event.data));
    }
  });

  return {
    ws,
    sendText(data: string) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    close() {
      ws.close();
    }
  };
}
