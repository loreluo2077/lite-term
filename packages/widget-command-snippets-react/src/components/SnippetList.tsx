import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { snippetPreview } from "../lib/snippet-utils";
import type { CommandSnippet } from "../types";

type SnippetListProps = {
  snippets: CommandSnippet[];
  selectedId: string | null;
  onSelect: (snippetId: string) => void;
  onTogglePin: (snippetId: string) => void;
  onMoveSelection: (direction: 1 | -1) => void;
};

function typeClass(type: CommandSnippet["type"]) {
  if (type === "command") return "border-emerald-700/60 bg-emerald-950/40 text-emerald-200";
  if (type === "prompt") return "border-blue-700/60 bg-blue-950/40 text-blue-200";
  if (type === "command_prompt") return "border-amber-700/60 bg-amber-950/40 text-amber-200";
  return "border-violet-700/60 bg-violet-950/40 text-violet-200";
}

function handleListKeydown(
  event: ReactKeyboardEvent<HTMLElement>,
  onMoveSelection: (direction: 1 | -1) => void
) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    onMoveSelection(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    onMoveSelection(-1);
  }
}

export function SnippetList({ snippets, selectedId, onSelect, onTogglePin, onMoveSelection }: SnippetListProps) {
  return (
    <section
      className="min-h-0 overflow-auto rounded-lg border border-zinc-700 bg-zinc-950/70 p-2"
      tabIndex={0}
      onKeyDown={(event) => {
        handleListKeydown(event, onMoveSelection);
      }}
    >
      {snippets.length === 0 ? (
        <div className="grid min-h-full place-items-center rounded-md border border-dashed border-zinc-700 p-4 text-xs text-zinc-500">
          没有匹配到 snippet
        </div>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {snippets.map((snippet) => {
            const active = snippet.id === selectedId;
            return (
              <li key={snippet.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(snippet.id);
                  }}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "border-sky-500 bg-sky-950/30"
                      : "border-zinc-700 bg-zinc-900/70 hover:border-zinc-500"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-100">{snippet.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] ${typeClass(snippet.type)}`}>
                          {snippet.type}
                        </span>
                        {snippet.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="inline-flex h-5 items-center rounded border border-zinc-700 bg-zinc-900 px-1.5 text-[10px] text-zinc-300">
                            #{tag}
                          </span>
                        ))}
                        {snippet.projectScope ? (
                          <span className="inline-flex h-5 items-center rounded border border-zinc-700 bg-zinc-900 px-1.5 text-[10px] text-zinc-400">
                            {snippet.projectScope}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onTogglePin(snippet.id);
                      }}
                      className={`h-6 w-6 rounded border text-xs ${
                        snippet.isPinned
                          ? "border-amber-500 bg-amber-950/60 text-amber-300"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                      }`}
                      title={snippet.isPinned ? "取消置顶" : "置顶"}
                    >
                      {snippet.isPinned ? "★" : "☆"}
                    </button>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-zinc-400">
                    {snippetPreview(snippet)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
