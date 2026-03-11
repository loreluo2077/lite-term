import { z } from "zod";

export const apiGatewayProviderTypeSchema = z.enum(["openai_compatible"]);

export const apiGatewayProviderHealthSchema = z.enum(["unknown", "ok", "error"]);

export const apiGatewayHeadersSchema = z.record(z.string(), z.string()).default({});

export const apiGatewayProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: apiGatewayProviderTypeSchema.default("openai_compatible"),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1).nullable().default(null),
  headers: apiGatewayHeadersSchema,
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  health: apiGatewayProviderHealthSchema.default("unknown"),
  lastCheckedAt: z.string().nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const apiGatewayProviderSummarySchema = apiGatewayProviderSchema.omit({
  apiKey: true
}).extend({
  hasApiKey: z.boolean(),
  apiKeyPreview: z.string().nullable().default(null)
});

export const apiGatewayProviderInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: apiGatewayProviderTypeSchema.default("openai_compatible"),
  baseUrl: z.string().min(1),
  apiKey: z.string().nullable().optional(),
  clearApiKey: z.boolean().optional(),
  headers: apiGatewayHeadersSchema,
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  health: apiGatewayProviderHealthSchema.optional(),
  lastCheckedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const apiGatewayModelAliasSchema = z.object({
  id: z.string().min(1),
  alias: z.string().min(1),
  providerId: z.string().min(1),
  upstreamModel: z.string().min(1),
  enabled: z.boolean().default(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const apiGatewayModelAliasInputSchema = z.object({
  id: z.string().min(1),
  alias: z.string().min(1),
  providerId: z.string().min(1),
  upstreamModel: z.string().min(1),
  enabled: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const apiGatewaySettingsSchema = z.object({
  listenHost: z.string().min(1).default("127.0.0.1"),
  listenPort: z.number().int().min(1).max(65535).default(4310),
  requestTimeoutMs: z.number().int().min(1000).max(120000).default(60000),
  autoStart: z.boolean().default(false),
  defaultProviderId: z.string().nullable().default(null),
  defaultModelAlias: z.string().nullable().default(null)
});

export const apiGatewayConfigSchema = z.object({
  providers: z.array(apiGatewayProviderSummarySchema),
  aliases: z.array(apiGatewayModelAliasSchema),
  settings: apiGatewaySettingsSchema
});

export const apiGatewaySaveConfigRequestSchema = z.object({
  providers: z.array(apiGatewayProviderInputSchema),
  aliases: z.array(apiGatewayModelAliasInputSchema),
  settings: apiGatewaySettingsSchema
});

export const apiGatewayStatusSchema = z.object({
  running: z.boolean(),
  listenHost: z.string().min(1),
  listenPort: z.number().int().min(1).max(65535),
  baseUrl: z.string().min(1),
  providerCount: z.number().int().nonnegative(),
  aliasCount: z.number().int().nonnegative(),
  defaultProviderId: z.string().nullable(),
  defaultModelAlias: z.string().nullable(),
  startedAt: z.string().nullable(),
  lastError: z.string().nullable()
});

export const apiGatewayCheckProviderHealthRequestSchema = z.object({
  providerId: z.string().min(1)
});

export const apiGatewayCheckProviderHealthResponseSchema = z.object({
  ok: z.boolean(),
  statusCode: z.number().int().nullable(),
  checkedAt: z.string().min(1),
  message: z.string().min(1)
});

export type ApiGatewayProviderType = z.infer<typeof apiGatewayProviderTypeSchema>;
export type ApiGatewayProviderHealth = z.infer<typeof apiGatewayProviderHealthSchema>;
export type ApiGatewayProvider = z.infer<typeof apiGatewayProviderSchema>;
export type ApiGatewayProviderSummary = z.infer<typeof apiGatewayProviderSummarySchema>;
export type ApiGatewayProviderInput = z.infer<typeof apiGatewayProviderInputSchema>;
export type ApiGatewayModelAlias = z.infer<typeof apiGatewayModelAliasSchema>;
export type ApiGatewayModelAliasInput = z.infer<typeof apiGatewayModelAliasInputSchema>;
export type ApiGatewaySettings = z.infer<typeof apiGatewaySettingsSchema>;
export type ApiGatewayConfig = z.infer<typeof apiGatewayConfigSchema>;
export type ApiGatewaySaveConfigRequest = z.infer<typeof apiGatewaySaveConfigRequestSchema>;
export type ApiGatewayStatus = z.infer<typeof apiGatewayStatusSchema>;
export type ApiGatewayCheckProviderHealthRequest = z.infer<
  typeof apiGatewayCheckProviderHealthRequestSchema
>;
export type ApiGatewayCheckProviderHealthResponse = z.infer<
  typeof apiGatewayCheckProviderHealthResponseSchema
>;
