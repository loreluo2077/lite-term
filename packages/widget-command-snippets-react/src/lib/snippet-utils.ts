import type {
  CommandSnippet,
  CommandSnippetsWidgetState,
  CommandSnippetType,
  SnippetDraftInput,
  SnippetFilterKind,
  SnippetSortKind
} from "../types";

const SNIPPET_TYPES: CommandSnippetType[] = ["command", "prompt", "command_prompt", "template"];

export function createSnippetId() {
  return globalThis.crypto?.randomUUID?.() ?? `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSnippetType(value: unknown): CommandSnippetType {
  return SNIPPET_TYPES.includes(value as CommandSnippetType) ? (value as CommandSnippetType) : "command";
}

export function parseTagsInput(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeStringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeNullableField(value: unknown): string | null {
  if (value === null) return null;
  const normalized = normalizeStringField(value);
  return normalized ?? null;
}

export function normalizeSnippet(value: unknown): CommandSnippet | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) return null;
  if (typeof source.title !== "string" || !source.title.trim()) return null;
  if (typeof source.content !== "string") return null;

  const createdAt = typeof source.createdAt === "string" && source.createdAt ? source.createdAt : new Date().toISOString();
  const updatedAt = typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : createdAt;

  const description = normalizeStringField(source.description);
  return {
    id: source.id,
    title: source.title.trim(),
    content: source.content,
    ...(description ? { description } : {}),
    type: normalizeSnippetType(source.type),
    tags: Array.isArray(source.tags)
      ? source.tags.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [],
    projectScope: normalizeNullableField(source.projectScope),
    agentScope: normalizeNullableField(source.agentScope),
    isPinned: source.isPinned === true,
    usageCount: Number.isFinite(source.usageCount) ? Math.max(0, Math.floor(source.usageCount as number)) : 0,
    lastUsedAt: typeof source.lastUsedAt === "string" && source.lastUsedAt ? source.lastUsedAt : null,
    createdAt,
    updatedAt
  };
}

export function normalizeWidgetState(raw: Record<string, unknown> | null | undefined): CommandSnippetsWidgetState {
  const source = raw ?? {};
  const snippets = Array.isArray(source.snippets)
    ? source.snippets
        .map((entry) => normalizeSnippet(entry))
        .filter((entry): entry is CommandSnippet => entry != null)
    : [];

  return { snippets };
}

function scoreText(value: string) {
  return value.toLowerCase();
}

export function matchSnippet(
  snippet: CommandSnippet,
  query: string,
  filter: SnippetFilterKind,
  workspaceName: string
) {
  if (filter === "pinned" && !snippet.isPinned) return false;
  if (filter === "current_project") {
    const scope = snippet.projectScope?.toLowerCase().trim();
    if (!scope || scope !== workspaceName.toLowerCase().trim()) return false;
  }
  if (filter !== "all" && filter !== "pinned" && filter !== "current_project" && snippet.type !== filter) {
    return false;
  }

  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;

  const haystack = [
    scoreText(snippet.title),
    scoreText(snippet.content),
    scoreText(snippet.description ?? ""),
    scoreText(snippet.tags.join(" ")),
    scoreText(snippet.projectScope ?? ""),
    scoreText(snippet.agentScope ?? "")
  ].join("\n");

  return haystack.includes(keyword);
}

function parseTime(value: string | null | undefined) {
  if (!value) return 0;
  const next = Date.parse(value);
  return Number.isFinite(next) ? next : 0;
}

export function sortSnippets(snippets: CommandSnippet[], sort: SnippetSortKind) {
  const sorted = [...snippets];

  sorted.sort((left, right) => {
    if (sort === "title") {
      return left.title.localeCompare(right.title, "zh-Hans-CN");
    }

    if (sort === "used") {
      if (right.usageCount !== left.usageCount) return right.usageCount - left.usageCount;
      return parseTime(right.lastUsedAt) - parseTime(left.lastUsedAt);
    }

    if (sort === "updated") {
      return parseTime(right.updatedAt) - parseTime(left.updatedAt);
    }

    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    const updated = parseTime(right.updatedAt) - parseTime(left.updatedAt);
    if (updated !== 0) return updated;
    return right.usageCount - left.usageCount;
  });

  return sorted;
}

export function createSnippetFromDraft(draft: SnippetDraftInput): CommandSnippet {
  const now = new Date().toISOString();
  const description = draft.description?.trim();
  return {
    id: createSnippetId(),
    title: draft.title.trim(),
    content: draft.content,
    ...(description ? { description } : {}),
    type: draft.type,
    tags: draft.tags,
    projectScope: draft.projectScope?.trim() || null,
    agentScope: draft.agentScope?.trim() || null,
    isPinned: draft.isPinned,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export function updateSnippetFromDraft(snippet: CommandSnippet, draft: SnippetDraftInput): CommandSnippet {
  const description = draft.description?.trim();
  const { description: _ignoredDescription, ...rest } = snippet;
  return {
    ...rest,
    title: draft.title.trim(),
    content: draft.content,
    ...(description ? { description } : {}),
    type: draft.type,
    tags: draft.tags,
    projectScope: draft.projectScope?.trim() || null,
    agentScope: draft.agentScope?.trim() || null,
    isPinned: draft.isPinned,
    updatedAt: new Date().toISOString()
  };
}

export function touchSnippetUsage(snippet: CommandSnippet): CommandSnippet {
  return {
    ...snippet,
    usageCount: snippet.usageCount + 1,
    lastUsedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function formatSnippetTitleAndContent(snippet: CommandSnippet) {
  return `标题: ${snippet.title}\n\n内容:\n${snippet.content}`;
}

export function snippetPreview(snippet: CommandSnippet) {
  const text = snippet.content.replace(/\s+/g, " ").trim();
  if (text.length <= 110) return text;
  return `${text.slice(0, 108)}...`;
}
