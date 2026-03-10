import type { LocalSessionStartupScript, SessionWorkerControlEvent } from "@localterm/shared";

export type StartupScriptRunnerOptions = {
  sessionId: string;
  scripts: LocalSessionStartupScript[];
  write: (data: string) => void;
  emitControl: (event: SessionWorkerControlEvent) => void;
};

const ANSI_PATTERN = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const OSC_PATTERN = /\x1b\][^\u0007]*(?:\u0007|\x1b\\)/g;
const PROMPT_PATTERN = /(?:^|\n)(?:\([^)]+\)\s+)?[^\n]*?(?:[%#$>] )$/;
const PROMPT_SETTLE_MS = 140;
const FALLBACK_READY_MS = 12_000;

function stripTerminalControl(text: string) {
  return text.replace(OSC_PATTERN, "").replace(ANSI_PATTERN, "");
}

function normalizeCommandForTerminal(command: string) {
  const trimmed = command.replace(/\r?\n+$/g, "");
  if (!trimmed) return "";
  return `${trimmed}\r`;
}

function sortStartupScripts(scripts: LocalSessionStartupScript[]) {
  return [...scripts]
    .filter((entry) => entry.enabled !== false && entry.command.trim().length > 0)
    .sort((left, right) => left.delayMs - right.delayMs);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StartupScriptRunner {
  private readonly sessionId: string;
  private readonly scripts: LocalSessionStartupScript[];
  private readonly writeToPty: (data: string) => void;
  private readonly emitControl: (event: SessionWorkerControlEvent) => void;
  private promptBuffer = "";
  private promptTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private readyDetected = false;
  private running = false;
  private completed = false;

  constructor(options: StartupScriptRunnerOptions) {
    this.sessionId = options.sessionId;
    this.scripts = sortStartupScripts(options.scripts);
    this.writeToPty = options.write;
    this.emitControl = options.emitControl;
  }

  hasScripts() {
    return this.scripts.length > 0;
  }

  start() {
    if (this.fallbackTimer || this.readyDetected || this.completed) return;
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      void this.markShellReady("fallback");
    }, FALLBACK_READY_MS);
  }

  dispose() {
    if (this.promptTimer) {
      clearTimeout(this.promptTimer);
      this.promptTimer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  onOutput(chunk: Uint8Array) {
    if (this.readyDetected || this.completed) return;
    const normalized = stripTerminalControl(Buffer.from(chunk).toString("utf8").replace(/\r/g, ""));
    if (!normalized) return;

    this.promptBuffer = `${this.promptBuffer}${normalized}`.slice(-4096);

    if (this.promptTimer) {
      clearTimeout(this.promptTimer);
    }
    this.promptTimer = setTimeout(() => {
      this.promptTimer = null;
      if (PROMPT_PATTERN.test(this.promptBuffer)) {
        void this.markShellReady("prompt");
      }
    }, PROMPT_SETTLE_MS);
  }

  private async markShellReady(detectedBy: "prompt" | "fallback") {
    if (this.readyDetected) return;
    this.readyDetected = true;
    this.dispose();
    this.emitControl({
      type: "shell-ready",
      sessionId: this.sessionId,
      detectedBy
    });
    await this.runScripts(detectedBy);
  }

  private async runScripts(detectedBy: "prompt" | "fallback") {
    if (!this.hasScripts()) {
      this.completed = true;
      return;
    }
    if (this.running || this.completed) return;
    this.running = true;
    this.emitControl({
      type: "startup-scripts-started",
      sessionId: this.sessionId,
      detectedBy,
      scriptCount: this.scripts.length
    });

    try {
      for (const script of this.scripts) {
        if (script.delayMs > 0) {
          await sleep(script.delayMs);
        }
        const command = normalizeCommandForTerminal(script.command);
        if (!command) continue;
        this.writeToPty(command);
      }

      this.completed = true;
      this.emitControl({
        type: "startup-scripts-complete",
        sessionId: this.sessionId,
        detectedBy,
        scriptCount: this.scripts.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitControl({
        type: "startup-scripts-error",
        sessionId: this.sessionId,
        detectedBy,
        message
      });
    } finally {
      this.running = false;
    }
  }
}
