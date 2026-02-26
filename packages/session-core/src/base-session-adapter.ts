/**
 * Common lifecycle guards for all session implementations (local, ssh later).
 */
import { EventEmitter } from "node:events";
import type { SessionAdapter } from "./session-adapter";

type ExitInfo = { exitCode: number | null; signal?: string };

export abstract class BaseSessionAdapter implements SessionAdapter {
  protected disposed = false;
  private readonly emitter = new EventEmitter();

  protected assertNotDisposed() {
    if (this.disposed) {
      throw new Error("Session adapter already disposed");
    }
  }

  protected markDisposed() {
    this.disposed = true;
  }

  protected emitData(data: Uint8Array) {
    this.emitter.emit("data", data);
  }

  protected emitExit(info: ExitInfo) {
    this.emitter.emit("exit", info);
  }

  protected emitError(error: Error) {
    this.emitter.emit("error", error);
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.emitter.on("data", cb);
  }

  onExit(cb: (info: ExitInfo) => void): void {
    this.emitter.on("exit", cb);
  }

  onError(cb: (error: Error) => void): void {
    this.emitter.on("error", cb);
  }

  abstract init(): Promise<void>;
  abstract write(data: string | Uint8Array): void;
  abstract resize(cols: number, rows: number): void;
  abstract kill(): void;
}
