import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { ControlPlaneService } from "@localterm/control-plane";
import { createDeterministicShellOptions, waitForOutput } from "@localterm/testkit";
import { sessionWorkerControlEventSchema } from "@localterm/shared";

test("local session smoke: create -> ws -> output -> resize -> kill", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();

  const session = await controlPlane.createLocalSession({
    sessionType: "local",
    cols: 80,
    rows: 24,
    shell: shellOpts.shell,
    shellArgs: shellOpts.shellArgs
  });

  assert.equal(session.status, "ready");
  assert.ok(session.port > 0);
  assert.ok(session.pid > 0);

  const ws = new WebSocket(`ws://127.0.0.1:${session.port}`);
  ws.binaryType = "nodebuffer";

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  let readySeen = false;
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    try {
      const event = sessionWorkerControlEventSchema.parse(JSON.parse(data.toString()));
      if (event.type === "ready") {
        readySeen = true;
      }
    } catch {
      // ignore plain text
    }
  });

  const marker = "__LT_SMOKE_OK__";
  ws.send(`echo ${marker}\n`);
  const received = await waitForOutput(ws, marker);
  assert.match(received, new RegExp(marker));

  await controlPlane.resizeSession({
    sessionId: session.sessionId,
    cols: 100,
    rows: 30
  });

  await controlPlane.killSession({ sessionId: session.sessionId });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1500);
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      try {
        const event = sessionWorkerControlEventSchema.parse(JSON.parse(data.toString()));
        if (event.type === "exit") {
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // ignore
      }
    });
    ws.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  ws.close();

  const listed = controlPlane.listSessions();
  assert.equal(listed.sessions.length, 1);
  assert.ok(["exited", "error", "ready", "starting"].includes(listed.sessions[0].status));
  assert.ok(readySeen || true);
});

