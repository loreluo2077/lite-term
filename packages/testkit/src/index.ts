/**
 * Shared test helpers for smoke/integration/e2e.
 * Examples: deterministic shell args, timeout helpers, process cleanup.
 */
import fs from "node:fs";
import { WebSocket } from "ws";

export const TEST_TIMEOUTS = {
  workerReady: 10_000,
  output: 10_000,
  kill: 5_000
} as const;

export function createDeterministicShellOptions() {
  if (process.platform === "win32") {
    return {
      shell: process.env.COMSPEC || "powershell.exe",
      shellArgs: []
    };
  }

  if (fs.existsSync("/bin/bash")) {
    return {
      shell: "/bin/bash",
      shellArgs: ["--noprofile", "--norc"]
    };
  }

  if (fs.existsSync("/bin/zsh")) {
    return {
      shell: "/bin/zsh",
      shellArgs: ["-f"]
    };
  }

  return {
    shell: process.env.SHELL || "/bin/sh",
    shellArgs: []
  };
}

export function waitForOutput(ws: WebSocket, marker: string, timeoutMs = TEST_TIMEOUTS.output) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for marker: ${marker}\nReceived:\n${buffer}`));
    }, timeoutMs);

    const onMessage = (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        const txt = data.toString();
        try {
          const parsed = JSON.parse(txt);
          if (parsed.type === "error") {
            cleanup();
            reject(new Error(parsed.message || "worker error event"));
            return;
          }
        } catch {
          buffer += txt;
        }
      } else {
        buffer += data.toString("utf8");
      }
      if (buffer.includes(marker)) {
        cleanup();
        resolve(buffer);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage as never);
    };

    ws.on("message", onMessage as never);
  });
}
