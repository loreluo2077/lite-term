import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  type ApiGatewayCheckProviderHealthResponse,
  type ApiGatewayConfig,
  type ApiGatewayModelAlias,
  type ApiGatewayProvider,
  type ApiGatewayProviderInput,
  type ApiGatewaySettings,
  type ApiGatewayStatus,
  apiGatewayCheckProviderHealthResponseSchema,
  apiGatewayConfigSchema,
  apiGatewayProviderSchema,
  apiGatewaySaveConfigRequestSchema,
  apiGatewayStatusSchema
} from "@localterm/shared";
import type {
  AssistantMessage,
  Context,
  Message,
  Model,
  ProviderStreamOptions,
  ToolCall
} from "@mariozechner/pi-ai";
import {
  readApiGatewayConfig,
  readApiGatewayConfigSummary,
  toProviderSummary,
  writeApiGatewayConfig
} from "./api-gateway-storage";

const DEFAULT_BASE_MODEL_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 8_192;
const HEALTH_TIMEOUT_MS = 5_000;
let piAiModulePromise: Promise<typeof import("@mariozechner/pi-ai")> | null = null;

type SaveConfigInput = Parameters<typeof apiGatewaySaveConfigRequestSchema.parse>[0];

type RouteTarget = {
  provider: ApiGatewayProvider;
  upstreamModel: string;
  exposedModel: string;
  alias: ApiGatewayModelAlias | null;
};

type GatewayChatRequest = {
  model?: string;
  messages?: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function loadPiAi() {
  if (!piAiModulePromise) {
    piAiModulePromise = import("@mariozechner/pi-ai");
  }
  return piAiModulePromise;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function mergeAuthHeaders(provider: ApiGatewayProvider) {
  const headers: Record<string, string> = {
    ...(provider.headers ?? {})
  };

  if (provider.apiKey && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

function createEmptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0
    }
  };
}

function contentToText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const candidate = entry as Record<string, unknown>;
        if (candidate.type === "text" && typeof candidate.text === "string") {
          return candidate.text;
        }
        if (typeof candidate.content === "string") {
          return candidate.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseToolCalls(input: unknown): ToolCall[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id : randomUUID();
      const functionBlock = candidate.function;
      if (!functionBlock || typeof functionBlock !== "object") return null;
      const fn = functionBlock as Record<string, unknown>;
      const name = typeof fn.name === "string" ? fn.name : "tool";
      let args: Record<string, unknown> = {};
      if (typeof fn.arguments === "string" && fn.arguments.trim()) {
        try {
          const parsed = JSON.parse(fn.arguments);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          args = { raw: fn.arguments };
        }
      }
      return {
        type: "toolCall" as const,
        id,
        name,
        arguments: args
      };
    })
    .filter((entry): entry is ToolCall => Boolean(entry));
}

function toPiAiContext(body: GatewayChatRequest): Context {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemParts: string[] = [];
  const contextMessages: Message[] = [];

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const candidate = message as Record<string, unknown>;
    const role = typeof candidate.role === "string" ? candidate.role : "user";
    const timestamp = Date.now();

    if (role === "system") {
      const text = contentToText(candidate.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (role === "user") {
      contextMessages.push({
        role: "user",
        content: contentToText(candidate.content),
        timestamp
      });
      continue;
    }

    if (role === "tool") {
      contextMessages.push({
        role: "toolResult",
        toolCallId:
          typeof candidate.tool_call_id === "string" && candidate.tool_call_id
            ? candidate.tool_call_id
            : randomUUID(),
        toolName: typeof candidate.name === "string" && candidate.name ? candidate.name : "tool",
        content: [
          {
            type: "text",
            text: contentToText(candidate.content)
          }
        ],
        isError: false,
        timestamp
      });
      continue;
    }

    if (role === "assistant") {
      const text = contentToText(candidate.content);
      const toolCalls = parseToolCalls(candidate.tool_calls);
      contextMessages.push({
        role: "assistant",
        content: [
          ...(text ? [{ type: "text" as const, text }] : []),
          ...toolCalls
        ],
        api: "openai-completions",
        provider: "localterm-gateway",
        model: "assistant-history",
        usage: createEmptyUsage(),
        stopReason: "stop",
        timestamp
      });
    }
  }

  if (systemParts.length > 0) {
    return {
      systemPrompt: systemParts.join("\n\n"),
      messages: contextMessages
    };
  }

  return {
    messages: contextMessages
  };
}

function extractAssistantText(message: AssistantMessage) {
  return message.content
    .filter((entry): entry is Extract<typeof entry, { type: "text" }> => entry.type === "text")
    .map((entry) => entry.text)
    .join("");
}

function extractAssistantToolCalls(message: AssistantMessage) {
  return message.content
    .filter((entry): entry is ToolCall => entry.type === "toolCall")
    .map((entry) => ({
      id: entry.id,
      type: "function",
      function: {
        name: entry.name,
        arguments: JSON.stringify(entry.arguments ?? {})
      }
    }));
}

function toOpenAiFinishReason(stopReason: AssistantMessage["stopReason"]) {
  switch (stopReason) {
    case "length":
      return "length";
    case "toolUse":
      return "tool_calls";
    case "error":
    case "aborted":
      return "stop";
    default:
      return "stop";
  }
}

function toOpenAiResponse(message: AssistantMessage, exposedModel: string) {
  const toolCalls = extractAssistantToolCalls(message);
  const content = extractAssistantText(message);
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: exposedModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
        },
        finish_reason: toOpenAiFinishReason(message.stopReason)
      }
    ],
    usage: {
      prompt_tokens: message.usage.input,
      completion_tokens: message.usage.output,
      total_tokens: message.usage.totalTokens
    }
  };
}

function buildModel(provider: ApiGatewayProvider, upstreamModel: string): Model<"openai-completions"> {
  return {
    id: upstreamModel,
    name: upstreamModel,
    api: "openai-completions",
    provider: provider.name || provider.id,
    baseUrl: trimTrailingSlash(provider.baseUrl),
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    },
    contextWindow: DEFAULT_BASE_MODEL_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    headers: provider.headers
  };
}

function normalizeConfig(config: {
  providers: ApiGatewayProvider[];
  aliases: ApiGatewayModelAlias[];
  settings: ApiGatewaySettings;
}) {
  const enabledProviders = config.providers.filter((entry) => entry.enabled);
  let defaultProviderId = config.settings.defaultProviderId;

  if (!defaultProviderId) {
    defaultProviderId = enabledProviders.find((entry) => entry.isDefault)?.id ?? null;
  }

  return {
    providers: config.providers,
    aliases: config.aliases,
    settings: {
      ...config.settings,
      defaultProviderId
    }
  };
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function writeNotFound(response: ServerResponse) {
  writeJson(response, 404, {
    error: {
      message: "Not found"
    }
  });
}

function createSseChunk(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export class ApiGatewayService {
  private userDataDir: string | null = null;
  private server: http.Server | null = null;
  private startedAt: string | null = null;
  private lastError: string | null = null;

  async initialize(userDataDir: string) {
    this.userDataDir = userDataDir;
    const config = normalizeConfig(await readApiGatewayConfig(userDataDir));
    if (config.settings.autoStart) {
      try {
        await this.start();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  private assertReady() {
    if (!this.userDataDir) {
      throw new Error("api gateway service is not initialized");
    }
    return this.userDataDir;
  }

  async getConfig(): Promise<ApiGatewayConfig> {
    const userDataDir = this.assertReady();
    return await readApiGatewayConfigSummary(userDataDir);
  }

  async saveConfig(payload: SaveConfigInput): Promise<ApiGatewayConfig> {
    const userDataDir = this.assertReady();
    const parsed = apiGatewaySaveConfigRequestSchema.parse(payload);
    const current = await readApiGatewayConfig(userDataDir);
    const currentById = new Map(current.providers.map((entry) => [entry.id, entry]));
    const timestamp = nowIso();

    let defaultProviderId: string | null = parsed.settings.defaultProviderId;
    const normalizedProviders = parsed.providers.map((entry, index) => {
      const existing = currentById.get(entry.id);
      const apiKey = entry.clearApiKey
        ? null
        : typeof entry.apiKey === "string"
          ? entry.apiKey.trim() || null
          : existing?.apiKey ?? null;
      const isDefault = defaultProviderId
        ? entry.id === defaultProviderId
        : index === 0 && entry.enabled;

      if (!defaultProviderId && isDefault) {
        defaultProviderId = entry.id;
      }

      return apiGatewayProviderSchema.parse({
        id: entry.id,
        name: entry.name.trim(),
        type: entry.type,
        baseUrl: trimTrailingSlash(entry.baseUrl.trim()),
        apiKey,
        headers: entry.headers ?? {},
        enabled: entry.enabled,
        isDefault,
        health: entry.health ?? existing?.health ?? "unknown",
        lastCheckedAt: entry.lastCheckedAt ?? existing?.lastCheckedAt ?? null,
        createdAt: entry.createdAt ?? existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      });
    });

    const normalizedAliases = parsed.aliases.map((entry) => {
      const existing = current.aliases.find((alias) => alias.id === entry.id);
      return {
        id: entry.id,
        alias: entry.alias.trim(),
        providerId: entry.providerId,
        upstreamModel: entry.upstreamModel.trim(),
        enabled: entry.enabled,
        createdAt: entry.createdAt ?? existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
    });

    const normalizedSettings = {
      ...parsed.settings,
      defaultProviderId,
      defaultModelAlias:
        parsed.settings.defaultModelAlias && parsed.settings.defaultModelAlias.trim().length > 0
          ? parsed.settings.defaultModelAlias.trim()
          : null
    };

    await writeApiGatewayConfig(userDataDir, {
      providers: normalizedProviders,
      aliases: normalizedAliases,
      settings: normalizedSettings
    });

    if (this.server) {
      await this.restart();
    }

    return apiGatewayConfigSchema.parse({
      providers: normalizedProviders.map(toProviderSummary),
      aliases: normalizedAliases,
      settings: normalizedSettings
    });
  }

  private async resolveConfig() {
    const userDataDir = this.assertReady();
    return normalizeConfig(await readApiGatewayConfig(userDataDir));
  }

  async getStatus(): Promise<ApiGatewayStatus> {
    const config = await this.resolveConfig();
    return apiGatewayStatusSchema.parse({
      running: Boolean(this.server),
      listenHost: config.settings.listenHost,
      listenPort: config.settings.listenPort,
      baseUrl: `http://${config.settings.listenHost}:${config.settings.listenPort}`,
      providerCount: config.providers.length,
      aliasCount: config.aliases.length,
      defaultProviderId: config.settings.defaultProviderId,
      defaultModelAlias: config.settings.defaultModelAlias,
      startedAt: this.startedAt,
      lastError: this.lastError
    });
  }

  async start() {
    if (this.server) {
      return await this.getStatus();
    }

    const config = await this.resolveConfig();

    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        if (response.headersSent) {
          response.end();
          return;
        }
        writeJson(response, 500, {
          error: {
            message: this.lastError
          }
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(config.settings.listenPort, config.settings.listenHost, () => {
        this.server?.off("error", reject);
        resolve();
      });
    }).catch((error) => {
      this.server = null;
      throw error;
    });

    this.startedAt = nowIso();
    this.lastError = null;
    return await this.getStatus();
  }

  async stop() {
    if (!this.server) {
      return await this.getStatus();
    }

    const server = this.server;
    this.server = null;
    this.startedAt = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return await this.getStatus();
  }

  async restart() {
    await this.stop();
    return await this.start();
  }

  async checkProviderHealth(providerId: string): Promise<ApiGatewayCheckProviderHealthResponse> {
    const config = await this.resolveConfig();
    const provider = config.providers.find((entry) => entry.id === providerId);
    if (!provider) {
      return apiGatewayCheckProviderHealthResponseSchema.parse({
        ok: false,
        statusCode: null,
        checkedAt: nowIso(),
        message: "provider not found"
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const checkedAt = nowIso();

    try {
      const response = await fetch(`${trimTrailingSlash(provider.baseUrl)}/models`, {
        method: "GET",
        headers: mergeAuthHeaders(provider),
        signal: controller.signal
      });
      clearTimeout(timer);

      const ok = response.ok;
      await this.updateProviderHealth(providerId, ok ? "ok" : "error", checkedAt);
      return apiGatewayCheckProviderHealthResponseSchema.parse({
        ok,
        statusCode: response.status,
        checkedAt,
        message: ok ? "provider reachable" : `upstream returned ${response.status}`
      });
    } catch (error) {
      clearTimeout(timer);
      await this.updateProviderHealth(providerId, "error", checkedAt);
      return apiGatewayCheckProviderHealthResponseSchema.parse({
        ok: false,
        statusCode: null,
        checkedAt,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async updateProviderHealth(
    providerId: string,
    health: ApiGatewayProvider["health"],
    checkedAt: string
  ) {
    const userDataDir = this.assertReady();
    const config = await readApiGatewayConfig(userDataDir);
    const nextProviders = config.providers.map((entry) =>
      entry.id === providerId
        ? {
            ...entry,
            health,
            lastCheckedAt: checkedAt,
            updatedAt: checkedAt
          }
        : entry
    );
    await writeApiGatewayConfig(userDataDir, {
      providers: nextProviders,
      aliases: config.aliases,
      settings: config.settings
    });
  }

  private resolveRoute(config: Awaited<ReturnType<ApiGatewayService["resolveConfig"]>>, requestedModel: string | undefined) {
    const requested = requestedModel?.trim() ?? "";
    if (requested) {
      const alias = config.aliases.find((entry) => entry.enabled && entry.alias === requested);
      if (alias) {
        const provider = config.providers.find((entry) => entry.id === alias.providerId && entry.enabled);
        if (!provider) {
          throw new Error(`provider for alias ${requested} is unavailable`);
        }
        return {
          provider,
          upstreamModel: alias.upstreamModel,
          exposedModel: alias.alias,
          alias
        } satisfies RouteTarget;
      }
    }

    if (!requested && config.settings.defaultModelAlias) {
      const alias = config.aliases.find(
        (entry) => entry.enabled && entry.alias === config.settings.defaultModelAlias
      );
      if (alias) {
        const provider = config.providers.find((entry) => entry.id === alias.providerId && entry.enabled);
        if (!provider) {
          throw new Error(`default model alias ${alias.alias} provider is unavailable`);
        }
        return {
          provider,
          upstreamModel: alias.upstreamModel,
          exposedModel: alias.alias,
          alias
        } satisfies RouteTarget;
      }
    }

    const defaultProvider = config.providers.find(
      (entry) => entry.enabled && entry.id === config.settings.defaultProviderId
    );
    if (!defaultProvider) {
      throw new Error("no enabled default provider configured");
    }

    if (!requested) {
      throw new Error("request model is required when no default alias is configured");
    }

    return {
      provider: defaultProvider,
      upstreamModel: requested,
      exposedModel: requested,
      alias: null
    } satisfies RouteTarget;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        ok: true,
        status: await this.getStatus()
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/models") {
      const config = await this.resolveConfig();
      writeJson(response, 200, {
        object: "list",
        data: config.aliases
          .filter((entry) => entry.enabled)
          .map((entry) => ({
            id: entry.alias,
            object: "model",
            created: Math.floor(new Date(entry.createdAt).getTime() / 1000) || 0,
            owned_by: entry.providerId
          }))
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = (await readJsonBody(request)) as GatewayChatRequest;
      const config = await this.resolveConfig();
      const target = this.resolveRoute(config, body.model);
      const context = toPiAiContext(body);
      const model = buildModel(target.provider, target.upstreamModel);
      const piAi = await loadPiAi();
      const options: ProviderStreamOptions = {
        headers: mergeAuthHeaders(target.provider),
        maxRetryDelayMs: config.settings.requestTimeoutMs,
        ...(target.provider.apiKey ? { apiKey: target.provider.apiKey } : {}),
        ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
        ...(typeof body.max_tokens === "number" ? { maxTokens: body.max_tokens } : {})
      };

      if (body.stream === true) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders?.();

        const streamId = `chatcmpl-${randomUUID()}`;
        response.write(
          createSseChunk({
            id: streamId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: target.exposedModel,
            choices: [
              {
                index: 0,
                delta: { role: "assistant" },
                finish_reason: null
              }
            ]
          })
        );

        try {
          for await (const event of piAi.stream(model, context, options)) {
            if (event.type === "text_delta") {
              response.write(
                createSseChunk({
                  id: streamId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: target.exposedModel,
                  choices: [
                    {
                      index: 0,
                      delta: { content: event.delta },
                      finish_reason: null
                    }
                  ]
                })
              );
              continue;
            }

            if (event.type === "done") {
              response.write(
                createSseChunk({
                  id: streamId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: target.exposedModel,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: toOpenAiFinishReason(event.message.stopReason)
                    }
                  ]
                })
              );
              response.write("data: [DONE]\n\n");
              response.end();
              return;
            }

            if (event.type === "error") {
              response.write(
                createSseChunk({
                  error: {
                    message: event.error.errorMessage || "upstream error"
                  }
                })
              );
              response.write("data: [DONE]\n\n");
              response.end();
              return;
            }
          }
        } catch (error) {
          response.write(
            createSseChunk({
              error: {
                message: error instanceof Error ? error.message : String(error)
              }
            })
          );
          response.write("data: [DONE]\n\n");
          response.end();
          return;
        }

        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }

      const result = await piAi.complete(model, context, options);
      writeJson(response, 200, toOpenAiResponse(result, target.exposedModel));
      return;
    }

    writeNotFound(response);
  }
}

export const apiGatewayService = new ApiGatewayService();
