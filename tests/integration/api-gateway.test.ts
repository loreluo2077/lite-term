import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { ApiGatewayService } from "../../apps/desktop/src/lib/api-gateway-service";
import {
  getApiGatewayStoragePaths,
  readApiGatewayConfigSummary,
  writeApiGatewayConfig
} from "../../apps/desktop/src/lib/api-gateway-storage";

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to resolve free port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function readJsonRequest(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

test("api gateway config persists to userData files", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-api-gateway-storage-"));

  try {
    await writeApiGatewayConfig(userDataDir, {
      providers: [
        {
          id: "provider-1",
          name: "Mock Provider",
          type: "openai_compatible",
          baseUrl: "http://127.0.0.1:4321/v1",
          apiKey: "secret-key",
          headers: {
            "x-test": "1"
          },
          enabled: true,
          isDefault: true,
          health: "unknown",
          lastCheckedAt: null,
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z"
        }
      ],
      aliases: [
        {
          id: "alias-1",
          alias: "local-fast",
          providerId: "provider-1",
          upstreamModel: "qwen2.5:7b",
          enabled: true,
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z"
        }
      ],
      settings: {
        listenHost: "127.0.0.1",
        listenPort: 4310,
        requestTimeoutMs: 60000,
        autoStart: false,
        defaultProviderId: "provider-1",
        defaultModelAlias: "local-fast"
      }
    });

    const summary = await readApiGatewayConfigSummary(userDataDir);
    const paths = getApiGatewayStoragePaths(userDataDir);

    assert.equal(summary.providers.length, 1);
    assert.equal(summary.providers[0]?.hasApiKey, true);
    assert.equal(summary.aliases[0]?.alias, "local-fast");
    assert.match(paths.providersPath, /api-gateway-providers\.json$/);
    assert.match(paths.aliasesPath, /api-gateway-aliases\.json$/);
    assert.match(paths.settingsPath, /api-gateway-settings\.json$/);
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});

test("api gateway service forwards OpenAI-compatible chat completions through pi-ai", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "localterm-api-gateway-service-"));
  const upstreamPort = await getFreePort();
  const gatewayPort = await getFreePort();
  const observed: {
    authHeader: string | null;
    model: string | null;
    messagesCount: number;
  } = {
    authHeader: null,
    model: null,
    messagesCount: 0
  };

  const upstream = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${upstreamPort}`);
    if (request.method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [] }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await readJsonRequest(request);
      observed.authHeader = request.headers.authorization ?? null;
      observed.model = typeof body.model === "string" ? body.model : null;
      observed.messagesCount = Array.isArray(body.messages) ? body.messages.length : 0;
      if (body.stream === true) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        response.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-upstream",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: "mock upstream answer"
                },
                finish_reason: null
              }
            ]
          })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-upstream",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: "stop"
              }
            ]
          })}\n\n`
        );
        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id: "chatcmpl-upstream",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "mock upstream answer"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 4,
            total_tokens: 9
          }
        })
      );
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    upstream.listen(upstreamPort, "127.0.0.1", () => resolve());
    upstream.once("error", reject);
  });

  const service = new ApiGatewayService();

  try {
    await service.initialize(userDataDir);
    await service.saveConfig({
      providers: [
        {
          id: "provider-1",
          name: "Mock Provider",
          type: "openai_compatible",
          baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
          apiKey: "secret-key",
          headers: {
            "x-localterm-test": "1"
          },
          enabled: true,
          isDefault: true
        }
      ],
      aliases: [
        {
          id: "alias-1",
          alias: "local-fast",
          providerId: "provider-1",
          upstreamModel: "qwen2.5:7b",
          enabled: true
        }
      ],
      settings: {
        listenHost: "127.0.0.1",
        listenPort: gatewayPort,
        requestTimeoutMs: 60000,
        autoStart: false,
        defaultProviderId: "provider-1",
        defaultModelAlias: "local-fast"
      }
    });

    const started = await service.start();
    assert.equal(started.running, true);
    assert.equal(started.listenPort, gatewayPort);

    const modelsResponse = await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`);
    const models = (await modelsResponse.json()) as { data: Array<{ id: string }> };
    assert.equal(models.data[0]?.id, "local-fast");

    const completionResponse = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "local-fast",
        messages: [
          {
            role: "user",
            content: "ping"
          }
        ]
      })
    });
    const completion = (await completionResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    assert.equal(completionResponse.status, 200);
    assert.equal(completion.choices?.[0]?.message?.content, "mock upstream answer");
    assert.equal(observed.authHeader, "Bearer secret-key");
    assert.equal(observed.model, "qwen2.5:7b");
    assert.equal(observed.messagesCount, 1);

    const health = await service.checkProviderHealth("provider-1");
    assert.equal(health.ok, true);

    const stopped = await service.stop();
    assert.equal(stopped.running, false);
  } finally {
    await service.stop().catch(() => undefined);
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
