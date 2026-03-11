import fs from "node:fs/promises";
import path from "node:path";
import {
  apiGatewayConfigSchema,
  apiGatewayModelAliasSchema,
  apiGatewayProviderSchema,
  apiGatewaySettingsSchema,
  type ApiGatewayConfig,
  type ApiGatewayModelAlias,
  type ApiGatewayProvider,
  type ApiGatewayProviderSummary,
  type ApiGatewaySettings
} from "@localterm/shared";

const STORE_ROOT_DIR = "workspace-store";
const GLOBAL_LIBRARY_DIR = "global";

const API_GATEWAY_FILES = {
  providers: "api-gateway-providers.json",
  aliases: "api-gateway-aliases.json",
  settings: "api-gateway-settings.json"
} as const;

function getStoreRoot(userDataDir: string) {
  return path.join(userDataDir, STORE_ROOT_DIR);
}

function getGlobalDir(userDataDir: string) {
  return path.join(getStoreRoot(userDataDir), GLOBAL_LIBRARY_DIR);
}

function getPathFor(userDataDir: string, key: keyof typeof API_GATEWAY_FILES) {
  return path.join(getGlobalDir(userDataDir), API_GATEWAY_FILES[key]);
}

async function ensureGlobalDir(userDataDir: string) {
  await fs.mkdir(getGlobalDir(userDataDir), { recursive: true });
}

async function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function maskApiKey(apiKey: string | null): { hasApiKey: boolean; apiKeyPreview: string | null } {
  if (!apiKey) {
    return {
      hasApiKey: false,
      apiKeyPreview: null
    };
  }

  const normalized = apiKey.trim();
  if (normalized.length <= 8) {
    return {
      hasApiKey: true,
      apiKeyPreview: `${normalized.slice(0, 2)}***`
    };
  }

  return {
    hasApiKey: true,
    apiKeyPreview: `${normalized.slice(0, 3)}***${normalized.slice(-4)}`
  };
}

export function toProviderSummary(provider: ApiGatewayProvider): ApiGatewayProviderSummary {
  const secret = maskApiKey(provider.apiKey ?? null);
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    headers: provider.headers,
    enabled: provider.enabled,
    isDefault: provider.isDefault,
    health: provider.health,
    lastCheckedAt: provider.lastCheckedAt,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    hasApiKey: secret.hasApiKey,
    apiKeyPreview: secret.apiKeyPreview
  };
}

export async function readApiGatewayConfig(userDataDir: string): Promise<{
  providers: ApiGatewayProvider[];
  aliases: ApiGatewayModelAlias[];
  settings: ApiGatewaySettings;
}> {
  await ensureGlobalDir(userDataDir);

  const [providersRaw, aliasesRaw, settingsRaw] = await Promise.all([
    readJsonFile<unknown[]>(getPathFor(userDataDir, "providers"), []),
    readJsonFile<unknown[]>(getPathFor(userDataDir, "aliases"), []),
    readJsonFile<unknown>(getPathFor(userDataDir, "settings"), {})
  ]);

  const providers = providersRaw.map((entry) => apiGatewayProviderSchema.parse(entry));
  const aliases = aliasesRaw.map((entry) => apiGatewayModelAliasSchema.parse(entry));
  const settings = apiGatewaySettingsSchema.parse(settingsRaw);

  return {
    providers,
    aliases,
    settings
  };
}

export async function readApiGatewayConfigSummary(userDataDir: string): Promise<ApiGatewayConfig> {
  const config = await readApiGatewayConfig(userDataDir);
  return apiGatewayConfigSchema.parse({
    providers: config.providers.map(toProviderSummary),
    aliases: config.aliases,
    settings: config.settings
  });
}

export async function writeApiGatewayConfig(
  userDataDir: string,
  payload: {
    providers: ApiGatewayProvider[];
    aliases: ApiGatewayModelAlias[];
    settings: ApiGatewaySettings;
  }
) {
  await ensureGlobalDir(userDataDir);
  await Promise.all([
    writeFileAtomic(getPathFor(userDataDir, "providers"), JSON.stringify(payload.providers, null, 2)),
    writeFileAtomic(getPathFor(userDataDir, "aliases"), JSON.stringify(payload.aliases, null, 2)),
    writeFileAtomic(getPathFor(userDataDir, "settings"), JSON.stringify(payload.settings, null, 2))
  ]);
  return { ok: true } as const;
}

export function getApiGatewayStoragePaths(userDataDir: string) {
  return {
    providersPath: getPathFor(userDataDir, "providers"),
    aliasesPath: getPathFor(userDataDir, "aliases"),
    settingsPath: getPathFor(userDataDir, "settings")
  };
}
