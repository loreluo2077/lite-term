import { execFileSync } from "node:child_process";
import process from "node:process";
import { ControlPlaneService } from "@localterm/control-plane";
import { createDeterministicShellOptions } from "@localterm/testkit";
import { sessionWorkerControlEventSchema } from "@localterm/shared";
import { WebSocket } from "ws";

type SessionRuntime = {
  sessionId: string;
  pid: number;
  port: number;
  ws: WebSocket;
  outputBytes: number;
  outputLines: number;
  readySeen: boolean;
  exitSeen: boolean;
  errorCount: number;
};

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleRssByPid(pids: number[]) {
  if (pids.length === 0) return {} as Record<number, number>;
  const out = execFileSync("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], {
    encoding: "utf8"
  });
  const map: Record<number, number> = {};
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    map[Number(m[1])] = Number(m[2]); // KB
  }
  return map;
}

function buildStressCommand(durationSec: number, burst: number, payloadSize: number) {
  const durationMs = durationSec * 1000;
  const js = [
    `const end=Date.now()+${durationMs};`,
    "let i=0;",
    `const payload=\"x\".repeat(${payloadSize});`,
    "const NL=String.fromCharCode(10);",
    "function tick(){",
    "  if(Date.now()>end){process.exit(0);return;}",
    `  for(let j=0;j<${burst};j++){process.stdout.write(Date.now()+\" \"+(i++)+\" \"+payload+NL);}`,
    "  setTimeout(tick,100);",
    "}",
    "tick();"
  ].join("");
  return `node -e '${js}'\n`;
}

async function main() {
  const sessionCount = envInt("SESSIONS", 4);
  const durationSec = envInt("DURATION_SEC", 60);
  const burstPerTick = envInt("BURST_PER_TICK", 120);
  const payloadSize = envInt("PAYLOAD_SIZE", 140);
  const sampleIntervalSec = envInt("SAMPLE_INTERVAL_SEC", 5);

  const controlPlane = new ControlPlaneService();
  const shellOpts = createDeterministicShellOptions();
  const stressCmd = buildStressCommand(durationSec, burstPerTick, payloadSize);
  const sessions: SessionRuntime[] = [];
  const startedAt = Date.now();
  const memorySamples: Array<{ tSec: number; totalRssKb: number; byPidKb: Record<number, number> }> = [];

  console.log(
    JSON.stringify(
      {
        phase: "start",
        sessionCount,
        durationSec,
        burstPerTick,
        payloadSize,
        sampleIntervalSec
      },
      null,
      2
    )
  );

  try {
    const created = await Promise.all(
      Array.from({ length: sessionCount }).map(() =>
        controlPlane.createLocalSession({
          sessionType: "local",
          cols: 120,
          rows: 30,
          shell: shellOpts.shell,
          shellArgs: shellOpts.shellArgs
        })
      )
    );

    for (const s of created) {
      const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
      ws.binaryType = "nodebuffer";
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      const rt: SessionRuntime = {
        sessionId: s.sessionId,
        pid: s.pid,
        port: s.port,
        ws,
        outputBytes: 0,
        outputLines: 0,
        readySeen: false,
        exitSeen: false,
        errorCount: 0
      };
      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          const text = data.toString("utf8");
          rt.outputBytes += Buffer.byteLength(text);
          rt.outputLines += text.split("\n").length - 1;
          return;
        }
        try {
          const ev = sessionWorkerControlEventSchema.parse(JSON.parse(data.toString()));
          if (ev.type === "ready") rt.readySeen = true;
          if (ev.type === "exit") rt.exitSeen = true;
          if (ev.type === "error") rt.errorCount += 1;
        } catch {
          const text = data.toString();
          rt.outputBytes += Buffer.byteLength(text);
          rt.outputLines += text.split("\n").length - 1;
        }
      });
      sessions.push(rt);
    }

    for (const s of sessions) {
      s.ws.send(stressCmd);
    }

    const sampler = setInterval(() => {
      const rssByPid = sampleRssByPid(sessions.map((s) => s.pid));
      const totalRssKb = Object.values(rssByPid).reduce((a, b) => a + b, 0);
      memorySamples.push({
        tSec: Math.round((Date.now() - startedAt) / 1000),
        totalRssKb,
        byPidKb: rssByPid
      });
    }, sampleIntervalSec * 1000);

    await sleep((durationSec + 2) * 1000);
    clearInterval(sampler);
  } finally {
    for (const s of sessions) {
      await controlPlane.killSession({ sessionId: s.sessionId }).catch(() => undefined);
      s.ws.close();
    }
  }

  const endedAt = Date.now();
  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSec: Math.round((endedAt - startedAt) / 1000),
    sessionCount: sessions.length,
    totals: {
      outputBytes: sessions.reduce((sum, s) => sum + s.outputBytes, 0),
      outputLines: sessions.reduce((sum, s) => sum + s.outputLines, 0),
      errors: sessions.reduce((sum, s) => sum + s.errorCount, 0)
    },
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      pid: s.pid,
      port: s.port,
      readySeen: s.readySeen,
      exitSeen: s.exitSeen,
      errorCount: s.errorCount,
      outputBytes: s.outputBytes,
      outputLines: s.outputLines
    })),
    memorySamples
  };

  console.log(JSON.stringify(summary, null, 2));
}

void main();
