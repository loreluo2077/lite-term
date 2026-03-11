import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  agentConfigListResponseSchema,
  agentConfigReadFileResponseSchema,
  type AgentConfigAgentKind,
  type AgentConfigFile,
  type AgentConfigListResponse,
  type AgentConfigResolved,
  type AgentConfigSnapshot
} from "@localterm/shared";

const DEFAULT_READ_FILE_MAX_BYTES = 1024 * 1024;

type DiscoveryOptions = {
  workspaceRootPath?: string | null;
  userHomePath?: string;
};

type FileDraft = Omit<AgentConfigFile, "exists">;

function makeId(agent: AgentConfigAgentKind, scope: "project" | "user", label: string) {
  return `${agent}:${scope}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function basename(targetPath: string) {
  const normalized = targetPath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? targetPath;
}

function stripQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

async function pathExists(targetPath: string) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

async function statSafe(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextIfExists(targetPath: string) {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

function captureTomlValue(raw: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matched = raw.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.+)$`, "m"));
    if (!matched?.[1]) continue;
    const cleaned = matched[1].replace(/\s+#.*$/, "").trim();
    if (!cleaned) continue;
    return stripQuotes(cleaned);
  }
  return null;
}

function parseCodexConfig(raw: string | null): AgentConfigResolved {
  if (!raw) {
    return {
      model: null,
      provider: null,
      apiBaseUrl: null,
      approvalMode: null,
      sandboxMode: null,
      reasoningEffort: null,
      skillsPath: null,
      mcpServers: []
    };
  }

  const mcpServers = [...raw.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]/gm)].map((match) => match[1]?.trim()).filter(Boolean) as string[];

  return {
    model: captureTomlValue(raw, ["model"]),
    provider: captureTomlValue(raw, ["provider"]),
    apiBaseUrl: captureTomlValue(raw, ["api_base_url", "base_url"]),
    approvalMode: captureTomlValue(raw, ["approval_policy", "approval_mode"]),
    sandboxMode: captureTomlValue(raw, ["sandbox_mode"]),
    reasoningEffort: captureTomlValue(raw, ["model_reasoning_effort", "reasoning_effort"]),
    skillsPath: captureTomlValue(raw, ["skills_path"]),
    mcpServers
  };
}

function readNestedString(value: unknown, pathParts: string[]) {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function parseClaudeSettings(raw: string | null): AgentConfigResolved {
  if (!raw) {
    return {
      model: null,
      provider: null,
      apiBaseUrl: null,
      approvalMode: null,
      sandboxMode: null,
      reasoningEffort: null,
      skillsPath: null,
      mcpServers: []
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcpServersValue = parsed.mcpServers;
    const mcpServers =
      mcpServersValue && typeof mcpServersValue === "object"
        ? Object.keys(mcpServersValue as Record<string, unknown>)
        : [];

    const skillsPath =
      readNestedString(parsed, ["skillsPath"]) ??
      readNestedString(parsed, ["skillsDir"]) ??
      readNestedString(parsed, ["skills", "path"]);

    return {
      model:
        readNestedString(parsed, ["model"]) ??
        readNestedString(parsed, ["defaultModel"]),
      provider: readNestedString(parsed, ["provider"]),
      apiBaseUrl:
        readNestedString(parsed, ["apiBaseUrl"]) ??
        readNestedString(parsed, ["baseUrl"]) ??
        readNestedString(parsed, ["env", "OPENAI_BASE_URL"]),
      approvalMode:
        readNestedString(parsed, ["approvalMode"]) ??
        readNestedString(parsed, ["approvalPolicy"]),
      sandboxMode: readNestedString(parsed, ["sandboxMode"]),
      reasoningEffort:
        readNestedString(parsed, ["reasoningEffort"]) ??
        readNestedString(parsed, ["modelReasoningEffort"]),
      skillsPath,
      mcpServers
    };
  } catch {
    return {
      model: null,
      provider: null,
      apiBaseUrl: null,
      approvalMode: null,
      sandboxMode: null,
      reasoningEffort: null,
      skillsPath: null,
      mcpServers: []
    };
  }
}

function summarizeResolved(resolved: AgentConfigResolved) {
  const parts: string[] = [];
  if (resolved.model) parts.push(`model ${resolved.model}`);
  if (resolved.approvalMode) parts.push(`approval ${resolved.approvalMode}`);
  if (resolved.sandboxMode) parts.push(`sandbox ${resolved.sandboxMode}`);
  if (resolved.mcpServers.length > 0) parts.push(`mcp ${resolved.mcpServers.length}`);
  if (resolved.skillsPath) parts.push("skills");
  return parts.length > 0 ? parts.join(" · ") : null;
}

async function makeFileEntry(draft: FileDraft): Promise<AgentConfigFile> {
  const stat = await statSafe(draft.path);
  return {
    ...draft,
    exists: Boolean(stat)
  };
}

async function buildCodexSnapshot(options: DiscoveryOptions): Promise<AgentConfigSnapshot> {
  const workspaceRootPath = options.workspaceRootPath?.trim() || "";
  const homeDir = options.userHomePath ?? os.homedir();
  const fileDrafts: FileDraft[] = [];

  if (workspaceRootPath) {
    fileDrafts.push(
      {
        id: makeId("codex", "project", "AGENTS.md"),
        agent: "codex",
        scope: "project",
        label: "AGENTS.md",
        path: path.join(workspaceRootPath, "AGENTS.md"),
        format: "markdown",
        entryType: "file",
        role: "instructions",
        editable: true,
        priority: 10,
        summary: "Project instructions"
      },
      {
        id: makeId("codex", "project", ".codex/config.toml"),
        agent: "codex",
        scope: "project",
        label: ".codex/config.toml",
        path: path.join(workspaceRootPath, ".codex", "config.toml"),
        format: "toml",
        entryType: "file",
        role: "config",
        editable: true,
        priority: 20,
        summary: "Project runtime config"
      }
    );

    const projectSkillsPath = path.join(workspaceRootPath, ".codex", "skills");
    if (await pathExists(projectSkillsPath)) {
      fileDrafts.push({
        id: makeId("codex", "project", ".codex/skills"),
        agent: "codex",
        scope: "project",
        label: ".codex/skills",
        path: projectSkillsPath,
        format: "directory",
        entryType: "directory",
        role: "skills",
        editable: false,
        priority: 30,
        summary: "Project skills directory"
      });
    }
  }

  fileDrafts.push(
    {
      id: makeId("codex", "user", "~/.codex/config.toml"),
      agent: "codex",
      scope: "user",
      label: "~/.codex/config.toml",
      path: path.join(homeDir, ".codex", "config.toml"),
      format: "toml",
      entryType: "file",
      role: "config",
      editable: true,
      priority: 110,
      summary: "User config"
    },
    {
      id: makeId("codex", "user", "~/.codex/AGENTS.md"),
      agent: "codex",
      scope: "user",
      label: "~/.codex/AGENTS.md",
      path: path.join(homeDir, ".codex", "AGENTS.md"),
      format: "markdown",
      entryType: "file",
      role: "instructions",
      editable: true,
      priority: 120,
      summary: "User instructions"
    }
  );

  const userSkillsPath = path.join(homeDir, ".codex", "skills");
  if (await pathExists(userSkillsPath)) {
    fileDrafts.push({
      id: makeId("codex", "user", "~/.codex/skills"),
      agent: "codex",
      scope: "user",
      label: "~/.codex/skills",
      path: userSkillsPath,
      format: "directory",
      entryType: "directory",
      role: "skills",
      editable: false,
      priority: 130,
      summary: "User skills directory"
    });
  }

  const files = (await Promise.all(fileDrafts.map((entry) => makeFileEntry(entry)))).sort(
    (left, right) => left.priority - right.priority
  );

  const resolvedSources = await Promise.all([
    readTextIfExists(path.join(workspaceRootPath || homeDir, ".codex", "config.toml")),
    readTextIfExists(path.join(homeDir, ".codex", "config.toml"))
  ]);
  const parsed = resolvedSources.map((source) => parseCodexConfig(source));
  const resolved = parsed.find((entry) => entry.model || entry.provider || entry.mcpServers.length > 0 || entry.skillsPath) ?? parsed[1] ?? parsed[0] ?? parseCodexConfig(null);

  return {
    agent: "codex",
    title: "Codex",
    description: "Codex CLI project and user config, instructions, MCP, and skills references.",
    files: files.map((entry) => {
      if (entry.role === "config" && entry.exists) {
        const source = entry.scope === "project" && workspaceRootPath
          ? resolvedSources[0]
          : resolvedSources[1];
        const nextSummary = summarizeResolved(parseCodexConfig(source));
        return {
          ...entry,
          summary: nextSummary ?? entry.summary
        };
      }
      return entry;
    }),
    resolved
  };
}

async function buildClaudeSnapshot(options: DiscoveryOptions): Promise<AgentConfigSnapshot> {
  const workspaceRootPath = options.workspaceRootPath?.trim() || "";
  const homeDir = options.userHomePath ?? os.homedir();
  const fileDrafts: FileDraft[] = [];

  if (workspaceRootPath) {
    fileDrafts.push(
      {
        id: makeId("claude_code", "project", "CLAUDE.md"),
        agent: "claude_code",
        scope: "project",
        label: "CLAUDE.md",
        path: path.join(workspaceRootPath, "CLAUDE.md"),
        format: "markdown",
        entryType: "file",
        role: "instructions",
        editable: true,
        priority: 10,
        summary: "Project instructions"
      },
      {
        id: makeId("claude_code", "project", ".claude/settings.json"),
        agent: "claude_code",
        scope: "project",
        label: ".claude/settings.json",
        path: path.join(workspaceRootPath, ".claude", "settings.json"),
        format: "json",
        entryType: "file",
        role: "config",
        editable: true,
        priority: 20,
        summary: "Project settings"
      },
      {
        id: makeId("claude_code", "project", ".claude/settings.local.json"),
        agent: "claude_code",
        scope: "project",
        label: ".claude/settings.local.json",
        path: path.join(workspaceRootPath, ".claude", "settings.local.json"),
        format: "json",
        entryType: "file",
        role: "config",
        editable: true,
        priority: 30,
        summary: "Project local overrides"
      }
    );

    for (const relativeDir of [".claude/skills", ".claude/commands"]) {
      const fullPath = path.join(workspaceRootPath, ...relativeDir.split("/"));
      if (await pathExists(fullPath)) {
        fileDrafts.push({
          id: makeId("claude_code", "project", relativeDir),
          agent: "claude_code",
          scope: "project",
          label: relativeDir,
          path: fullPath,
          format: "directory",
          entryType: "directory",
          role: "skills",
          editable: false,
          priority: relativeDir.endsWith("skills") ? 40 : 50,
          summary: basename(fullPath)
        });
      }
    }
  }

  fileDrafts.push({
    id: makeId("claude_code", "user", "~/.claude/settings.json"),
    agent: "claude_code",
    scope: "user",
    label: "~/.claude/settings.json",
    path: path.join(homeDir, ".claude", "settings.json"),
    format: "json",
    entryType: "file",
    role: "config",
    editable: true,
    priority: 110,
    summary: "User settings"
  });

  for (const relativeDir of [".claude/skills", ".claude/commands"]) {
    const fullPath = path.join(homeDir, ...relativeDir.split("/"));
    if (await pathExists(fullPath)) {
      fileDrafts.push({
        id: makeId("claude_code", "user", `~/${relativeDir}`),
        agent: "claude_code",
        scope: "user",
        label: `~/${relativeDir}`,
        path: fullPath,
        format: "directory",
        entryType: "directory",
        role: "skills",
        editable: false,
        priority: relativeDir.endsWith("skills") ? 120 : 130,
        summary: basename(fullPath)
      });
    }
  }

  const files = (await Promise.all(fileDrafts.map((entry) => makeFileEntry(entry)))).sort(
    (left, right) => left.priority - right.priority
  );

  const projectSettings = workspaceRootPath ? await readTextIfExists(path.join(workspaceRootPath, ".claude", "settings.json")) : null;
  const projectLocalSettings = workspaceRootPath ? await readTextIfExists(path.join(workspaceRootPath, ".claude", "settings.local.json")) : null;
  const userSettings = await readTextIfExists(path.join(homeDir, ".claude", "settings.json"));
  const resolvedCandidates = [projectLocalSettings, projectSettings, userSettings].map((entry) => parseClaudeSettings(entry));
  const resolved = resolvedCandidates.find((entry) => entry.model || entry.provider || entry.apiBaseUrl || entry.mcpServers.length > 0 || entry.skillsPath) ?? parseClaudeSettings(null);

  return {
    agent: "claude_code",
    title: "Claude Code",
    description: "Claude Code settings, project instructions, MCP servers, and local skills directories.",
    files: files.map((entry) => {
      if (entry.role === "config" && entry.exists) {
        const source = entry.path.endsWith("settings.local.json")
          ? projectLocalSettings
          : entry.scope === "project"
            ? projectSettings
            : userSettings;
        const nextSummary = summarizeResolved(parseClaudeSettings(source));
        return {
          ...entry,
          summary: nextSummary ?? entry.summary
        };
      }
      return entry;
    }),
    resolved
  };
}

export async function listAgentConfigSnapshots(options: DiscoveryOptions = {}): Promise<AgentConfigListResponse> {
  const snapshots = await Promise.all([
    buildCodexSnapshot(options),
    buildClaudeSnapshot(options)
  ]);
  return agentConfigListResponseSchema.parse({ snapshots });
}

export async function readAgentConfigFile(targetPath: string, maxBytes = DEFAULT_READ_FILE_MAX_BYTES) {
  try {
    const contentBuffer = await fs.readFile(targetPath);
    const truncated = contentBuffer.byteLength > maxBytes;
    const finalBuffer = truncated ? contentBuffer.subarray(0, maxBytes) : contentBuffer;
    return agentConfigReadFileResponseSchema.parse({
      path: targetPath,
      content: finalBuffer.toString("utf8"),
      truncated
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return agentConfigReadFileResponseSchema.parse({
        path: targetPath,
        content: "",
        truncated: false
      });
    }
    throw error;
  }
}

export async function writeAgentConfigFile(targetPath: string, content: string) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
  return { ok: true } as const;
}
