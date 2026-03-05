export interface SessionAdapter {
  init(): Promise<void>;
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: Uint8Array) => void): void;
  onExit(cb: (info: { exitCode: number | null; signal?: string }) => void): void;
  onError(cb: (error: Error) => void): void;
}

export type SessionAdapterFactory<TOptions> = (options: TOptions) => SessionAdapter;
