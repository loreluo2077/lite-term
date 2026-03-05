import type { CreateLocalSessionResponse } from "@localterm/shared";
import type {
  LocalTerminalWidgetInput,
  WidgetDriver,
  WidgetDriverHandle
} from "../types";

async function createSession(input: LocalTerminalWidgetInput): Promise<CreateLocalSessionResponse> {
  return window.localtermApi.session.createLocalSession({
    sessionType: "local",
    ...input
  });
}

export const localTerminalWidgetDriver: WidgetDriver<"terminal.local"> = {
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
  async dispose(handle: WidgetDriverHandle) {
    if (!handle.session) return;
    await window.localtermApi.session
      .killSession({ sessionId: handle.session.sessionId })
      .catch(() => undefined);
  }
};

