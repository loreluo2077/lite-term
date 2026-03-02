import type {
  CreateLocalSessionResponse
} from "@localterm/shared";
import type {
  LocalTerminalDriverInput,
  TabDriver,
  TabDriverHandle
} from "../types";

async function createSession(input: LocalTerminalDriverInput): Promise<CreateLocalSessionResponse> {
  return window.localtermApi.session.createLocalSession({
    sessionType: "local",
    ...input
  });
}

export const localTerminalTabDriver: TabDriver<"terminal.local"> = {
  kind: "terminal.local",
  async create(input) {
    const session = await createSession(input);
    return {
      session,
      status: session.status
    };
  },
  async restore(input) {
    const session = await createSession(input);
    return {
      session,
      status: session.status
    };
  },
  async dispose(handle: TabDriverHandle) {
    if (!handle.session) return;
    await window.localtermApi.session
      .killSession({ sessionId: handle.session.sessionId })
      .catch(() => undefined);
  }
};

