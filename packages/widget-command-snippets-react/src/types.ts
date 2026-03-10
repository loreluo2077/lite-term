export type CommandSnippetType =
  | "command"
  | "prompt"
  | "command_prompt"
  | "template";

export interface CommandSnippet {
  id: string;
  title: string;
  content: string;
  description?: string;
  type: CommandSnippetType;
  tags: string[];
  projectScope?: string | null;
  agentScope?: string | null;
  isPinned: boolean;
  usageCount: number;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SnippetFilterKind =
  | "all"
  | "pinned"
  | "command"
  | "prompt"
  | "command_prompt"
  | "template"
  | "current_project";

export type SnippetSortKind = "smart" | "updated" | "used" | "title";

export type CommandSnippetsWidgetState = {
  snippets: CommandSnippet[];
};

export type SnippetDraftInput = {
  title: string;
  content: string;
  description?: string;
  type: CommandSnippetType;
  tags: string[];
  projectScope?: string | null;
  agentScope?: string | null;
  isPinned: boolean;
};
