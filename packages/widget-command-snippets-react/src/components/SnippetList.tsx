import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { snippetPreview } from "../lib/snippet-utils";
import type { CommandSnippet } from "../types";

type SnippetListProps = {
  snippets: CommandSnippet[];
  selectedId: string | null;
  currentWorkspaceId: string;
  currentWorkspaceRootPath: string;
  onSelect: (snippetId: string) => void;
  onTogglePin: (snippetId: string) => void;
  onMoveSelection: (direction: 1 | -1) => void;
};

function typeClass(type: CommandSnippet["type"]) {
  if (type === "command") return "snippet-type-badge snippet-type-badge--command";
  if (type === "prompt") return "snippet-type-badge snippet-type-badge--prompt";
  if (type === "command_prompt") return "snippet-type-badge snippet-type-badge--command-prompt";
  return "snippet-type-badge snippet-type-badge--template";
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

function isCurrentWorkspaceSnippet(
  snippet: CommandSnippet,
  currentWorkspaceId: string,
  currentWorkspaceRootPath: string
) {
  if (currentWorkspaceId && snippet.workspaceScopeId === currentWorkspaceId) return true;
  return Boolean(
    currentWorkspaceRootPath &&
      snippet.workspaceRootPath &&
      snippet.workspaceRootPath.toLowerCase().trim() === currentWorkspaceRootPath.toLowerCase().trim()
  );
}

export function SnippetList({
  snippets,
  selectedId,
  currentWorkspaceId,
  currentWorkspaceRootPath,
  onSelect,
  onTogglePin,
  onMoveSelection
}: SnippetListProps) {
  return (
    <section className="snippet-list" tabIndex={0} onKeyDown={(event) => {
      handleListKeydown(event, onMoveSelection);
    }}>
      {snippets.length === 0 ? (
        <div className="snippet-list__empty">
          没有匹配到 snippet
        </div>
      ) : (
        <ul className="snippet-list__items">
          {snippets.map((snippet) => {
            const active = snippet.id === selectedId;
            const currentWorkspace = isCurrentWorkspaceSnippet(
              snippet,
              currentWorkspaceId,
              currentWorkspaceRootPath
            );
            return (
              <li key={snippet.id} className={active ? "snippet-list__item is-active" : "snippet-list__item"}>
                <div className="snippet-list__item-top">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(snippet.id);
                    }}
                    className="snippet-list__item-main"
                  >
                    <div className="snippet-list__title">{snippet.title}</div>
                    <div className="snippet-list__meta">
                      {currentWorkspace ? (
                        <span className="snippet-scope-badge">Current workspace</span>
                      ) : null}
                      <span className={typeClass(snippet.type)}>
                        {snippet.type}
                      </span>
                      {snippet.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="widget-chip">
                          #{tag}
                        </span>
                      ))}
                      {snippet.projectScope ? (
                        <span className="widget-chip">
                          {snippet.projectScope}
                        </span>
                      ) : null}
                    </div>
                    <div className="snippet-list__preview">
                      {snippetPreview(snippet)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePin(snippet.id);
                    }}
                    className={snippet.isPinned ? "snippet-list__pin is-active" : "snippet-list__pin"}
                    title={snippet.isPinned ? "取消置顶" : "置顶"}
                  >
                    {snippet.isPinned ? "★" : "☆"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
