/**
 * SessionRegistry tracks worker process metadata only.
 * It must not contain terminal protocol logic.
 */
export type SessionRegistryRecord = {
  sessionId: string;
  pid: number;
  port: number;
  status: "starting" | "ready" | "exited" | "error";
  lastError?: string;
};

export class SessionRegistry {
  private readonly records = new Map<string, SessionRegistryRecord>();

  set(record: SessionRegistryRecord) {
    this.records.set(record.sessionId, record);
  }

  update(sessionId: string, patch: Partial<SessionRegistryRecord>) {
    const prev = this.records.get(sessionId);
    if (!prev) return;
    this.records.set(sessionId, { ...prev, ...patch, sessionId: prev.sessionId });
  }

  get(sessionId: string) {
    return this.records.get(sessionId);
  }

  delete(sessionId: string) {
    this.records.delete(sessionId);
  }

  list() {
    return Array.from(this.records.values());
  }
}
