/**
 * node-pty adapter for local shell sessions.
 * This package should contain no Electron code.
 */
import os from "node:os";
import process from "node:process";
import type { IPty } from "@homebridge/node-pty-prebuilt-multiarch";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { BaseSessionAdapter } from "@localterm/session-core";
import type { CreateLocalSessionRequest } from "@localterm/shared";

export type LocalSessionAdapterOptions = CreateLocalSessionRequest;

function defaultShell(): string {
  if (process.platform === "win32") {
    // Prefer PowerShell over cmd.exe to match electerm behavior.
    // On Windows, COMSPEC typically points to cmd.exe, so we explicitly
    // default to powershell.exe unless COMSPEC already contains powershell.
    const comspec = process.env.COMSPEC || "";
    return comspec.toLowerCase().includes("powershell") ? comspec : "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function defaultShellArgs(shell: string): string[] {
  if (process.platform === "win32") return [];
  // Runtime default should respect user's shell startup files so prompt/env
  // (e.g. conda "(base)") behaves like a normal interactive terminal.
  void shell;
  return [];
}

function sanitizeNodeOptions(nodeOptions: string | undefined) {
  if (!nodeOptions) return nodeOptions;
  // Remove dev bootstrap option leaked from Electron startup scripts.
  const cleaned = nodeOptions
    .replace(/(?:^|\s)--import(?:=|\s+)tsx(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

export class LocalSessionAdapter extends BaseSessionAdapter {
  private readonly options: LocalSessionAdapterOptions;
  private ptyProcess: IPty | null = null;

  constructor(options: LocalSessionAdapterOptions) {
    super();
    this.options = options;
  }

  async init() {
    this.assertNotDisposed();
    const shell = this.options.shell ?? defaultShell();
    const shellArgs = this.options.shellArgs ?? defaultShellArgs(shell);
    const cwd = this.options.cwd ?? os.homedir();
    const env = {
      ...process.env,
      ...(this.options.env ?? {})
    } as Record<string, string>;
    const nodeOptions = sanitizeNodeOptions(env.NODE_OPTIONS);
    if (nodeOptions) {
      env.NODE_OPTIONS = nodeOptions;
    } else {
      delete env.NODE_OPTIONS;
    }
    // Internal Electron worker bootstrap var should not leak to user shells.
    delete env.ELECTRON_RUN_AS_NODE;

    const termName = process.platform === "win32" ? "xterm-color" : "xterm-256color";
    this.ptyProcess = pty.spawn(shell, shellArgs, {
      cols: this.options.cols,
      rows: this.options.rows,
      cwd,
      env,
      name: termName,
      encoding: null
    });

    this.ptyProcess.onData((data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      this.emitData(new Uint8Array(buf));
    });

    this.ptyProcess.onExit((event) => {
      const signal = event.signal ? String(event.signal) : null;
      this.emitExit(
        signal
          ? { exitCode: event.exitCode, signal }
          : { exitCode: event.exitCode }
      );
      this.markDisposed();
      this.ptyProcess = null;
    });
  }

  write(data: string | Uint8Array) {
    this.assertNotDisposed();
    if (!this.ptyProcess) return;
    if (typeof data === "string") {
      this.ptyProcess.write(data);
      return;
    }
    this.ptyProcess.write(Buffer.from(data).toString("utf8"));
  }

  resize(cols: number, rows: number) {
    if (!this.ptyProcess || this.disposed) return;
    this.ptyProcess.resize(cols, rows);
  }

  kill() {
    if (this.disposed) return;
    this.markDisposed();
    this.ptyProcess?.kill();
    this.ptyProcess = null;
  }
}
