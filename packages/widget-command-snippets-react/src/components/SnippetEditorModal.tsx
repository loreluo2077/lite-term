import { useEffect, useState } from "react";
import { parseTagsInput } from "../lib/snippet-utils";
import type { CommandSnippet, CommandSnippetType, SnippetDraftInput } from "../types";

type SnippetEditorModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialSnippet: CommandSnippet | null;
  workspaceName: string;
  onClose: () => void;
  onSubmit: (draft: SnippetDraftInput) => void;
};

const DEFAULT_TYPE: CommandSnippetType = "command";

export function SnippetEditorModal({
  open,
  mode,
  initialSnippet,
  workspaceName,
  onClose,
  onSubmit
}: SnippetEditorModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CommandSnippetType>(DEFAULT_TYPE);
  const [tagsInput, setTagsInput] = useState("");
  const [projectScope, setProjectScope] = useState("");
  const [agentScope, setAgentScope] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const source = initialSnippet;
    setTitle(source?.title ?? "");
    setContent(source?.content ?? "");
    setDescription(source?.description ?? "");
    setType(source?.type ?? DEFAULT_TYPE);
    setTagsInput(source?.tags.join(", ") ?? "");
    setProjectScope(source?.projectScope ?? workspaceName ?? "");
    setAgentScope(source?.agentScope ?? "");
    setIsPinned(source?.isPinned ?? false);
    setError(null);
  }, [initialSnippet, open, workspaceName]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid w-[min(760px,95vw)] max-h-[90vh] min-h-0 grid-rows-[auto_1fr_auto] rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-zinc-100">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="m-0 text-sm font-semibold">{mode === "create" ? "新建 Snippet" : "编辑 Snippet"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 hover:border-zinc-500"
          >
            关闭
          </button>
        </header>

        <div className="min-h-0 overflow-auto pr-1">
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs text-zinc-300">
              标题 *
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-sky-500"
              />
            </label>

            <label className="grid gap-1 text-xs text-zinc-300">
              内容 *
              <textarea
                value={content}
                spellCheck={false}
                onChange={(event) => {
                  setContent(event.target.value);
                }}
                rows={8}
                className="rounded border border-zinc-700 bg-zinc-900 p-3 font-mono text-[12px] text-zinc-100 outline-none focus:border-sky-500"
              />
            </label>

            <label className="grid gap-1 text-xs text-zinc-300">
              描述
              <input
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-sky-500"
              />
            </label>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-300">
                类型
                <select
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as CommandSnippetType);
                  }}
                  className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-sky-500"
                >
                  <option value="command">command</option>
                  <option value="prompt">prompt</option>
                  <option value="command_prompt">command_prompt</option>
                  <option value="template">template</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs text-zinc-300">
                标签（逗号分隔）
                <input
                  value={tagsInput}
                  onChange={(event) => {
                    setTagsInput(event.target.value);
                  }}
                  placeholder="test, ci, codex"
                  className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-500"
                />
              </label>

              <label className="grid gap-1 text-xs text-zinc-300">
                projectScope
                <input
                  value={projectScope}
                  onChange={(event) => {
                    setProjectScope(event.target.value);
                  }}
                  className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-sky-500"
                />
              </label>

              <label className="grid gap-1 text-xs text-zinc-300">
                agentScope
                <input
                  value={agentScope}
                  onChange={(event) => {
                    setAgentScope(event.target.value);
                  }}
                  className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <label className="mt-1 inline-flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(event) => {
                  setIsPinned(event.target.checked);
                }}
              />
              置顶
            </label>
          </div>
        </div>

        <footer className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-red-300">{error ?? ""}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200 hover:border-zinc-500"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                if (!title.trim()) {
                  setError("标题不能为空");
                  return;
                }
                if (!content.trim()) {
                  setError("内容不能为空");
                  return;
                }
                setError(null);
                onSubmit({
                  title,
                  content,
                  description,
                  type,
                  tags: parseTagsInput(tagsInput),
                  projectScope,
                  agentScope,
                  isPinned
                });
              }}
              className="h-8 rounded border border-sky-700 bg-sky-900/70 px-3 text-xs text-sky-100 hover:border-sky-500"
            >
              {mode === "create" ? "创建" : "保存"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
