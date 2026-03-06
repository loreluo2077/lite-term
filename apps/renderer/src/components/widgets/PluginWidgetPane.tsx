import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WidgetTabRecord } from "../../lib/widgets/state";
import {
  buildWebviewWidgetUrl,
  getWidgetTemplate,
  parseWidgetInput
} from "../../lib/plugins";
import type {
  OpenWidgetRequest,
  WidgetApiRequest,
  WidgetApiResponse,
  WidgetTabSummary
} from "../../lib/plugins";

type Props = {
  tab: WidgetTabRecord;
  isActive: boolean;
  workspaceId: string;
  workspaceName: string;
  tabsSummary: WidgetTabSummary[];
  webviewPreloadUrl: string | null;
  onUpdateInput: (tabId: string, input: Record<string, unknown>) => void;
  onUpdateTitle: (tabId: string, title: string) => void;
  onOpenWidget: (request: OpenWidgetRequest) => void;
  onActivateTab: (tabId: string) => void;
};

type WebviewLikeElement = HTMLElement & {
  send: (channel: string, ...args: unknown[]) => void;
  addEventListener: (
    type: "ipc-message" | "dom-ready",
    listener: (event: { channel: string; args: unknown[] }) => void
  ) => void;
  removeEventListener: (
    type: "ipc-message" | "dom-ready",
    listener: (event: { channel: string; args: unknown[] }) => void
  ) => void;
};

function buildErrorResponse(requestId: string, code: string, message: string): WidgetApiResponse {
  return {
    requestId,
    ok: false,
    error: {
      code,
      message
    }
  };
}

async function resolveSessionPort(sessionId: string) {
  const listed = await window.localtermApi.session.listSessions();
  const matched = listed.sessions.find((entry) => entry.sessionId === sessionId);
  return matched?.port ?? null;
}

async function writeSessionInput(port: number, data: string) {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error("terminal write timeout"));
    }, 3000);

    ws.addEventListener("open", () => {
      if (settled) return;
      try {
        ws.send(data);
      } catch (error) {
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      settled = true;
      clearTimeout(timer);
      setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 30);
      resolve();
    });

    ws.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("terminal write websocket error"));
    });

    ws.addEventListener("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("terminal write websocket closed before open"));
    });
  });
}

export function PluginWidgetPane({
  tab,
  isActive,
  workspaceId,
  workspaceName,
  tabsSummary,
  webviewPreloadUrl,
  onUpdateInput,
  onUpdateTitle,
  onOpenWidget,
  onActivateTab
}: Props) {
  const widgetInput = parseWidgetInput(tab.widget.input);
  const template = widgetInput
    ? getWidgetTemplate(widgetInput.extensionId, widgetInput.widgetId)
    : null;

  const webviewRef = useRef<WebviewLikeElement | null>(null);
  const [isWebviewReady, setIsWebviewReady] = useState(false);

  const currentInputRef = useRef(widgetInput);
  const currentTitleRef = useRef(tab.title);
  const currentActiveRef = useRef(isActive);

  currentInputRef.current = widgetInput;
  currentTitleRef.current = tab.title;
  currentActiveRef.current = isActive;

  const webviewSrc = useMemo(() => {
    if (!widgetInput) return "";
    return buildWebviewWidgetUrl(widgetInput);
  }, [widgetInput]);

  const terminalMeta = useMemo(() => {
    if (!widgetInput) return null;
    if (widgetInput.extensionId !== "builtin.workspace" || widgetInput.widgetId !== "terminal.local") {
      return null;
    }

    const state = widgetInput.state as Record<string, unknown>;
    const port = typeof state.port === "number" && Number.isFinite(state.port) ? state.port : 0;
    const status = typeof state.status === "string" && state.status ? state.status : "idle";
    const wsConnected = state.wsConnected === true;
    return { port, status, wsConnected };
  }, [widgetInput]);

  const hasPermission = useCallback(
    (permission: string) => Boolean(template?.permissions.includes(permission as never)),
    [template]
  );

  const handleApiRequest = useCallback(
    async (request: WidgetApiRequest): Promise<WidgetApiResponse> => {
      const { requestId, method, params } = request;
      const input = currentInputRef.current;

      if (!requestId || typeof requestId !== "string") {
        return buildErrorResponse("unknown", "BAD_REQUEST", "requestId is required");
      }
      if (!input) {
        return buildErrorResponse(requestId, "INVALID_INPUT", "invalid widget input");
      }

      try {
        switch (method) {
          case "widget.getContext": {
            return {
              requestId,
              ok: true,
              result: {
                tabId: tab.id,
                tabTitle: currentTitleRef.current,
                isActive: currentActiveRef.current,
                input,
                workspaceId,
                workspaceName
              }
            };
          }
          case "widget.setTitle": {
            const nextTitle = typeof params?.title === "string" ? params.title.trim() : "";
            if (!nextTitle) {
              return buildErrorResponse(requestId, "INVALID_ARGS", "title is required");
            }
            onUpdateTitle(tab.id, nextTitle);
            return { requestId, ok: true, result: { ok: true } };
          }
          case "widget.openWidget": {
            const widgetId = typeof params?.widgetId === "string" ? params.widgetId : "";
            if (!widgetId) {
              return buildErrorResponse(requestId, "INVALID_ARGS", "widgetId is required");
            }
            const nextRequest: OpenWidgetRequest = {
              extensionId:
                typeof params?.extensionId === "string" && params.extensionId
                  ? params.extensionId
                  : input.extensionId,
              widgetId
            };
            if (typeof params?.title === "string") {
              nextRequest.title = params.title;
            }
            if (params?.state && typeof params.state === "object") {
              nextRequest.state = params.state as Record<string, unknown>;
            }
            if (typeof params?.paneId === "string") {
              nextRequest.paneId = params.paneId;
            }
            onOpenWidget({
              ...nextRequest
            });
            return { requestId, ok: true, result: { ok: true } };
          }
          case "state.get": {
            return { requestId, ok: true, result: input.state };
          }
          case "state.set": {
            if (!params?.state || typeof params.state !== "object") {
              return buildErrorResponse(requestId, "INVALID_ARGS", "state object is required");
            }
            onUpdateInput(tab.id, {
              ...input,
              state: params.state as Record<string, unknown>
            });
            return { requestId, ok: true, result: { ok: true } };
          }
          case "state.patch": {
            if (!params?.state || typeof params.state !== "object") {
              return buildErrorResponse(requestId, "INVALID_ARGS", "state object is required");
            }
            onUpdateInput(tab.id, {
              ...input,
              state: {
                ...input.state,
                ...(params.state as Record<string, unknown>)
              }
            });
            return { requestId, ok: true, result: { ok: true } };
          }
          case "workspace.getCurrent": {
            if (!hasPermission("workspace.read") && !hasPermission("workspace.write")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "workspace permission is required");
            }
            return {
              requestId,
              ok: true,
              result: {
                id: workspaceId,
                name: workspaceName
              }
            };
          }
          case "workspace.listTabs": {
            if (!hasPermission("workspace.read") && !hasPermission("workspace.write")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "workspace permission is required");
            }
            return {
              requestId,
              ok: true,
              result: tabsSummary
            };
          }
          case "workspace.activateTab": {
            if (!hasPermission("workspace.write")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "workspace.write permission is required");
            }
            const tabId = typeof params?.tabId === "string" ? params.tabId : "";
            if (!tabId) {
              return buildErrorResponse(requestId, "INVALID_ARGS", "tabId is required");
            }
            onActivateTab(tabId);
            return { requestId, ok: true, result: { ok: true } };
          }
          case "fs.pickDirectory": {
            if (!hasPermission("fs.read")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "fs.read permission is required");
            }
            return {
              requestId,
              ok: true,
              result: await window.localtermApi.file.pickDirectory()
            };
          }
          case "fs.pickFile": {
            if (!hasPermission("fs.read")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "fs.read permission is required");
            }
            return {
              requestId,
              ok: true,
              result: await window.localtermApi.file.pickFile(
                params as Parameters<typeof window.localtermApi.file.pickFile>[0]
              )
            };
          }
          case "fs.readDir": {
            if (!hasPermission("fs.read")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "fs.read permission is required");
            }
            return {
              requestId,
              ok: true,
              result: await window.localtermApi.file.readDir(
                params as Parameters<typeof window.localtermApi.file.readDir>[0]
              )
            };
          }
          case "fs.readFile": {
            if (!hasPermission("fs.read")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "fs.read permission is required");
            }
            return {
              requestId,
              ok: true,
              result: await window.localtermApi.file.readFile(
                params as Parameters<typeof window.localtermApi.file.readFile>[0]
              )
            };
          }
          case "terminal.create":
            if (!hasPermission("session.create")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "session.create permission is required");
            }
            {
              const cols = typeof params?.cols === "number" ? Math.floor(params.cols) : 120;
              const rows = typeof params?.rows === "number" ? Math.floor(params.rows) : 30;
              const requestPayload: Parameters<typeof window.localtermApi.session.createLocalSession>[0] = {
                sessionType: "local",
                cols,
                rows
              };
              if (typeof params?.shell === "string" && params.shell.trim()) {
                requestPayload.shell = params.shell;
              }
              if (typeof params?.cwd === "string" && params.cwd.trim()) {
                requestPayload.cwd = params.cwd;
              }
              if (params?.env && typeof params.env === "object") {
                requestPayload.env = params.env as Record<string, string>;
              }
              if (Array.isArray(params?.shellArgs)) {
                requestPayload.shellArgs = params.shellArgs.filter(
                  (entry): entry is string => typeof entry === "string"
                );
              }
              if (Array.isArray(params?.startupScripts)) {
                requestPayload.startupScripts = params.startupScripts as Parameters<
                  typeof window.localtermApi.session.createLocalSession
                >[0]["startupScripts"];
              }

              const session = await window.localtermApi.session.createLocalSession(requestPayload);
              return {
                requestId,
                ok: true,
                result: {
                  ...session,
                  wsUrl: `ws://127.0.0.1:${session.port}`
                }
              };
            }
          case "terminal.write":
            if (!hasPermission("session.list")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "session.list permission is required");
            }
            {
              const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
              const data = typeof params?.data === "string" ? params.data : "";
              if (!sessionId || !data) {
                return buildErrorResponse(requestId, "INVALID_ARGS", "sessionId and data are required");
              }
              const port = await resolveSessionPort(sessionId);
              if (!port) {
                return buildErrorResponse(requestId, "NOT_FOUND", "session not found");
              }
              await writeSessionInput(port, data);
              return { requestId, ok: true, result: { ok: true } };
            }
          case "terminal.resize":
            if (!hasPermission("session.create")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "session.create permission is required");
            }
            {
              const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
              const cols = typeof params?.cols === "number" ? Math.floor(params.cols) : 0;
              const rows = typeof params?.rows === "number" ? Math.floor(params.rows) : 0;
              if (!sessionId || cols <= 0 || rows <= 0) {
                return buildErrorResponse(requestId, "INVALID_ARGS", "sessionId, cols, rows are required");
              }
              await window.localtermApi.session.resizeSession({ sessionId, cols, rows });
              return { requestId, ok: true, result: { ok: true } };
            }
          case "terminal.kill":
            if (!hasPermission("session.kill")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "session.kill permission is required");
            }
            {
              const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
              if (!sessionId) {
                return buildErrorResponse(requestId, "INVALID_ARGS", "sessionId is required");
              }
              await window.localtermApi.session.killSession({ sessionId });
              return { requestId, ok: true, result: { ok: true } };
            }
          case "terminal.list":
            if (!hasPermission("session.list")) {
              return buildErrorResponse(requestId, "PERMISSION_DENIED", "session.list permission is required");
            }
            {
              const listed = await window.localtermApi.session.listSessions();
              return { requestId, ok: true, result: listed.sessions };
            }
          default:
            return buildErrorResponse(requestId, "METHOD_NOT_FOUND", `unknown method: ${method}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildErrorResponse(requestId, "INTERNAL_ERROR", message);
      }
    },
    [
      hasPermission,
      onActivateTab,
      onOpenWidget,
      onUpdateInput,
      onUpdateTitle,
      tab.id,
      tabsSummary,
      workspaceId,
      workspaceName
    ]
  );

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const onDomReady = () => {
      setIsWebviewReady(true);
    };

    const onIpcMessage = (event: { channel: string; args: unknown[] }) => {
      if (event.channel !== "widget-api-request") return;
      const payload = event.args[0] as WidgetApiRequest | undefined;
      if (!payload) return;
      void handleApiRequest(payload).then((response) => {
        webview.send("widget-api-response", response);
      });
    };

    webview.addEventListener("dom-ready", onDomReady as never);
    webview.addEventListener("ipc-message", onIpcMessage as never);

    return () => {
      webview.removeEventListener("dom-ready", onDomReady as never);
      webview.removeEventListener("ipc-message", onIpcMessage as never);
      setIsWebviewReady(false);
    };
  }, [handleApiRequest, webviewSrc]);

  useEffect(() => {
    if (!isWebviewReady) return;
    const webview = webviewRef.current;
    if (!webview || !widgetInput) return;
    webview.send("widget-host-event", {
      topic: "state.changed",
      state: widgetInput.state
    });
  }, [isWebviewReady, widgetInput]);

  if (!widgetInput) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-red-900/50 bg-zinc-950 p-4 text-sm text-red-200">
        Invalid widget input payload.
      </div>
    );
  }

  if (!template) {
    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-400">
          Missing widget template: {widgetInput.extensionId}:{widgetInput.widgetId}
        </div>
        <div className="grid place-items-center text-xs text-zinc-500">
          Install or re-enable the extension to restore this tab.
        </div>
      </div>
    );
  }

  if (!webviewPreloadUrl) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
        Preparing widget runtime...
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
        <span className="truncate">
          {terminalMeta
            ? `${tab.title} · ${terminalMeta.port > 0 ? `port ${terminalMeta.port}` : "no session"} · ${terminalMeta.status}`
            : `${tab.title} · widget ${widgetInput.extensionId}:${widgetInput.widgetId}`}
        </span>
        <div className="flex items-center gap-2">
          {terminalMeta ? (
            <span className={terminalMeta.wsConnected ? "text-emerald-400" : "text-zinc-500"}>
              {terminalMeta.wsConnected ? "ws connected" : "ws disconnected"}
            </span>
          ) : null}
          <span
            data-testid="widget-runtime-status"
            className={isWebviewReady ? "text-emerald-400" : "text-amber-400"}
          >
            runtime {isWebviewReady ? "ready" : "loading"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => {
              const nextTitle = window.prompt("Tab title", tab.title)?.trim();
              if (!nextTitle) return;
              onUpdateTitle(tab.id, nextTitle);
            }}
          >
            Rename
          </Button>
        </div>
      </div>
      <div className="min-h-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
        <webview
          ref={(element) => {
            webviewRef.current = element as unknown as WebviewLikeElement;
          }}
          src={webviewSrc}
          preload={webviewPreloadUrl}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
