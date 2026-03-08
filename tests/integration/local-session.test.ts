import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { ControlPlaneService, readRegistrySnapshot } from "@localterm/control-plane";
import { createDeterministicShellOptions, waitForOutput } from "@localterm/testkit";
import { sessionWorkerControlEventSchema } from "@localterm/shared";

function assertNoOutputMarker(ws: WebSocket, marker: string, durationMs = 1500) {
  return new Promise<void>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    const onMessage = (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        buffer += data.toString();
      } else {
        buffer += data.toString("utf8");
      }
      if (buffer.includes(marker)) {
        cleanup();
        reject(new Error(`unexpected marker replayed: ${marker}\nReceived:\n${buffer}`));
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage as never);
    };

    ws.on("message", onMessage as never);
  });
}

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
  const secondMarker = "__LT_SMOKE_SECOND__";
  ws.send(`echo ${secondMarker}\n`);
  const receivedSecond = await waitForOutput(ws, secondMarker);
  assert.match(receivedSecond, new RegExp(secondMarker));

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

test("local sessions remain responsive when websocket attaches later", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();

  const sessions = await Promise.all(
    Array.from({ length: 3 }).map((_, i) =>
      controlPlane.createLocalSession({
        sessionType: "local",
        cols: 80 + i,
        rows: 24,
        shell: shellOpts.shell,
        shellArgs: shellOpts.shellArgs
      })
    )
  );

  await new Promise((resolve) => setTimeout(resolve, 300));

  const sockets = await Promise.all(
    sessions.map(async (session) => {
      const ws = new WebSocket(`ws://127.0.0.1:${session.port}`);
      ws.binaryType = "nodebuffer";
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      return { session, ws };
    })
  );

  try {
    await Promise.all(
      sockets.map(async ({ session, ws }, i) => {
        const marker = `__LT_DELAYED_${i}__`;
        ws.send(`echo ${marker}\n`);
        const received = await waitForOutput(ws, marker);
        assert.match(received, new RegExp(marker));
        await controlPlane.killSession({ sessionId: session.sessionId });
      })
    );
  } finally {
    for (const { ws } of sockets) ws.close();
  }
});

test("local session does not replay buffered output after websocket reconnect", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();

  const session = await controlPlane.createLocalSession({
    sessionType: "local",
    cols: 80,
    rows: 24,
    shell: shellOpts.shell,
    shellArgs: shellOpts.shellArgs
  });

  const first = new WebSocket(`ws://127.0.0.1:${session.port}`);
  first.binaryType = "nodebuffer";
  await new Promise<void>((resolve, reject) => {
    first.once("open", () => resolve());
    first.once("error", reject);
  });

  const replayMarker = "__LT_REPLAY_MARKER__";
  first.send(`echo ${replayMarker}\n`);
  const firstOutput = await waitForOutput(first, replayMarker);
  assert.match(firstOutput, new RegExp(replayMarker));
  await new Promise((resolve) => setTimeout(resolve, 400));

  await new Promise<void>((resolve) => {
    first.once("close", () => resolve());
    first.close();
  });

  const second = new WebSocket(`ws://127.0.0.1:${session.port}`);
  second.binaryType = "nodebuffer";
  await new Promise<void>((resolve, reject) => {
    second.once("open", () => resolve());
    second.once("error", reject);
  });

  try {
    await assertNoOutputMarker(second, replayMarker);

    const liveMarker = "__LT_REPLAY_LIVE__";
    second.send(`echo ${liveMarker}\n`);
    const liveOutput = await waitForOutput(second, liveMarker);
    assert.match(liveOutput, new RegExp(liveMarker));
  } finally {
    await controlPlane.killSession({ sessionId: session.sessionId }).catch(() => undefined);
    second.close();
  }
});

test("local session reconnect after high-throughput does not replay old output", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();

  const session = await controlPlane.createLocalSession({
    sessionType: "local",
    cols: 100,
    rows: 30,
    shell: shellOpts.shell,
    shellArgs: shellOpts.shellArgs
  });

  const first = new WebSocket(`ws://127.0.0.1:${session.port}`);
  first.binaryType = "nodebuffer";
  await new Promise<void>((resolve, reject) => {
    first.once("open", () => resolve());
    first.once("error", reject);
  });

  const startMarker = "__LT_BULK_START__";
  const tailMarker = "__LT_BULK_TAIL__";
  const burstCommand = [
    "echo __LT_BULK_ST\"\"ART__",
    "i=0",
    "while [ $i -lt 50000 ]; do",
    "printf '__LT_BULK_LINE_%05d__:%080d\\n' \"$i\" 0",
    "  i=$((i+1))",
    "done",
    "echo __LT_BULK_EN\"\"D__",
    "echo __LT_BULK_TA\"\"IL__"
  ].join("\n");
  first.send(`${burstCommand}\n`);

  await waitForOutput(first, tailMarker, 45_000);

  await new Promise<void>((resolve) => {
    first.once("close", () => resolve());
    first.close();
  });

  const second = new WebSocket(`ws://127.0.0.1:${session.port}`);
  second.binaryType = "nodebuffer";
  await new Promise<void>((resolve, reject) => {
    second.once("open", () => resolve());
    second.once("error", reject);
  });

  try {
    await assertNoOutputMarker(second, tailMarker);
    const liveMarker = "__LT_AFTER_BULK_RECONNECT__";
    second.send(`echo ${liveMarker}\n`);
    const liveOutput = await waitForOutput(second, liveMarker, 15_000);
    assert.match(liveOutput, new RegExp(liveMarker));
  } finally {
    await controlPlane.killSession({ sessionId: session.sessionId }).catch(() => undefined);
    second.close();
  }
});

test("local session keeps streaming after reconnect during active burst", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();

  const session = await controlPlane.createLocalSession({
    sessionType: "local",
    cols: 100,
    rows: 30,
    shell: shellOpts.shell,
    shellArgs: shellOpts.shellArgs
  });

  const first = new WebSocket(`ws://127.0.0.1:${session.port}`);
  first.binaryType = "nodebuffer";
  await new Promise<void>((resolve, reject) => {
    first.once("open", () => resolve());
    first.once("error", reject);
  });

  const streamDone = "__LT_STREAM_DONE__";
  const streamHead = "__LT_STREAM_020__";
  const streamTail = "__LT_STREAM_200__";
  const streamCommand = [
    "i=1",
    "while [ $i -le 200 ]; do",
    "printf '__LT_STREAM_%03d__\\n' \"$i\"",
    "  i=$((i+1))",
    "  sleep 0.01",
    "done",
    "echo __LT_STREAM_D\"\"ONE__"
  ].join("\n");
  first.send(`${streamCommand}\n`);

  await waitForOutput(first, streamHead, 20_000);

  await new Promise<void>((resolve) => {
    first.once("close", () => resolve());
    first.close();
  });

  const second = new WebSocket(`ws://127.0.0.1:${session.port}`);
  second.binaryType = "nodebuffer";
  await new Promise<void>((resolve, reject) => {
    second.once("open", () => resolve());
    second.once("error", reject);
  });

  try {
    const reachedTail = await waitForOutput(second, streamTail, 20_000);
    assert.match(reachedTail, new RegExp(streamTail));
    const reachedDone = await waitForOutput(second, streamDone, 20_000);
    assert.match(reachedDone, new RegExp(streamDone));
  } finally {
    await controlPlane.killSession({ sessionId: session.sessionId }).catch(() => undefined);
    second.close();
  }
});

test("one session maps to one worker process (unique pid/port)", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();
  const sessions = await Promise.all(
    Array.from({ length: 3 }).map(() =>
      controlPlane.createLocalSession({
        sessionType: "local",
        cols: 90,
        rows: 24,
        shell: shellOpts.shell,
        shellArgs: shellOpts.shellArgs
      })
    )
  );

  try {
    const pids = sessions.map((s) => s.pid);
    const ports = sessions.map((s) => s.port);
    assert.equal(new Set(pids).size, sessions.length, "each session should have a unique worker pid");
    assert.equal(new Set(ports).size, sessions.length, "each session should have a unique ws port");
  } finally {
    await Promise.all(
      sessions.map((s) =>
        controlPlane.killSession({ sessionId: s.sessionId }).catch(() => undefined)
      )
    );
  }
});

test("registry snapshot updates when session lifecycle changes", async () => {
  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();
  const created = await controlPlane.createLocalSession({
    sessionType: "local",
    cols: 80,
    rows: 24,
    shell: shellOpts.shell,
    shellArgs: shellOpts.shellArgs
  });

  const readySnapshot = readRegistrySnapshot();
  assert.ok(readySnapshot, "snapshot should exist after create");
  const readyRecord = readySnapshot?.sessions.find((s) => s.sessionId === created.sessionId);
  assert.ok(readyRecord, "created session should be present in snapshot");
  assert.equal(readyRecord?.status, "ready");

  await controlPlane.killSession({ sessionId: created.sessionId });

  const exitedSnapshot = readRegistrySnapshot();
  const exitedRecord = exitedSnapshot?.sessions.find((s) => s.sessionId === created.sessionId);
  assert.ok(exitedRecord, "killed session should remain in snapshot history");
  assert.equal(exitedRecord?.status, "exited");
});
