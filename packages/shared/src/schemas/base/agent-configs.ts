import { z } from "zod";

export const agentConfigAgentKindSchema = z.enum(["codex", "claude_code"]);

export const agentConfigScopeSchema = z.enum(["project", "user"]);

export const agentConfigEntryTypeSchema = z.enum(["file", "directory"]);

export const agentConfigFormatSchema = z.enum(["json", "toml", "markdown", "directory", "text"]);

export const agentConfigRoleSchema = z.enum([
  "config",
  "instructions",
  "skills",
  "mcp",
  "resource"
]);

export const agentConfigResolvedSchema = z.object({
  model: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  apiBaseUrl: z.string().nullable().default(null),
  approvalMode: z.string().nullable().default(null),
  sandboxMode: z.string().nullable().default(null),
  reasoningEffort: z.string().nullable().default(null),
  skillsPath: z.string().nullable().default(null),
  mcpServers: z.array(z.string().min(1)).default([])
});

export const agentConfigFileSchema = z.object({
  id: z.string().min(1),
  agent: agentConfigAgentKindSchema,
  scope: agentConfigScopeSchema,
  label: z.string().min(1),
  path: z.string().min(1),
  format: agentConfigFormatSchema,
  entryType: agentConfigEntryTypeSchema,
  role: agentConfigRoleSchema,
  exists: z.boolean(),
  editable: z.boolean(),
  priority: z.number().int(),
  summary: z.string().nullable().default(null)
});

export const agentConfigSnapshotSchema = z.object({
  agent: agentConfigAgentKindSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  files: z.array(agentConfigFileSchema),
  resolved: agentConfigResolvedSchema
});

export const agentConfigListRequestSchema = z.object({
  workspaceRootPath: z.string().nullable().optional()
});

export const agentConfigListResponseSchema = z.object({
  snapshots: z.array(agentConfigSnapshotSchema)
});

export const agentConfigReadFileRequestSchema = z.object({
  path: z.string().min(1)
});

export const agentConfigReadFileResponseSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  truncated: z.boolean()
});

export const agentConfigWriteFileRequestSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const agentConfigRevealPathRequestSchema = z.object({
  path: z.string().min(1)
});

export type AgentConfigAgentKind = z.infer<typeof agentConfigAgentKindSchema>;
export type AgentConfigScope = z.infer<typeof agentConfigScopeSchema>;
export type AgentConfigEntryType = z.infer<typeof agentConfigEntryTypeSchema>;
export type AgentConfigFormat = z.infer<typeof agentConfigFormatSchema>;
export type AgentConfigRole = z.infer<typeof agentConfigRoleSchema>;
export type AgentConfigResolved = z.infer<typeof agentConfigResolvedSchema>;
export type AgentConfigFile = z.infer<typeof agentConfigFileSchema>;
export type AgentConfigSnapshot = z.infer<typeof agentConfigSnapshotSchema>;
export type AgentConfigListRequest = z.infer<typeof agentConfigListRequestSchema>;
export type AgentConfigListResponse = z.infer<typeof agentConfigListResponseSchema>;
export type AgentConfigReadFileRequest = z.infer<typeof agentConfigReadFileRequestSchema>;
export type AgentConfigReadFileResponse = z.infer<typeof agentConfigReadFileResponseSchema>;
export type AgentConfigWriteFileRequest = z.infer<typeof agentConfigWriteFileRequestSchema>;
export type AgentConfigRevealPathRequest = z.infer<typeof agentConfigRevealPathRequestSchema>;
