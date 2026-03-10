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
      className="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="snippet-editor-modal">
        <header className="snippet-editor-modal__header">
          <div>
            <div className="widget-eyebrow">Command Snippets</div>
            <h2 className="snippet-editor-modal__title">{mode === "create" ? "新建 Snippet" : "编辑 Snippet"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="widget-button widget-button--ghost"
          >
            关闭
          </button>
        </header>

        <div className="snippet-editor-modal__body">
          <div className="snippet-editor-modal__fields">
            <label className="snippet-editor-modal__field">
              标题 *
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                className="widget-input"
              />
            </label>

            <label className="snippet-editor-modal__field">
              内容 *
              <textarea
                value={content}
                spellCheck={false}
                onChange={(event) => {
                  setContent(event.target.value);
                }}
                rows={8}
                className="widget-textarea widget-code"
              />
            </label>

            <label className="snippet-editor-modal__field">
              描述
              <input
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                className="widget-input"
              />
            </label>

            <div className="snippet-editor-modal__grid">
              <label className="snippet-editor-modal__field">
                类型
                <select
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as CommandSnippetType);
                  }}
                  className="widget-select"
                >
                  <option value="command">command</option>
                  <option value="prompt">prompt</option>
                  <option value="command_prompt">command_prompt</option>
                  <option value="template">template</option>
                </select>
              </label>

              <label className="snippet-editor-modal__field">
                标签（逗号分隔）
                <input
                  value={tagsInput}
                  onChange={(event) => {
                    setTagsInput(event.target.value);
                  }}
                  placeholder="test, ci, codex"
                  className="widget-input"
                />
              </label>

              <label className="snippet-editor-modal__field">
                projectScope
                <input
                  value={projectScope}
                  onChange={(event) => {
                    setProjectScope(event.target.value);
                  }}
                  className="widget-input"
                />
              </label>

              <label className="snippet-editor-modal__field">
                agentScope
                <input
                  value={agentScope}
                  onChange={(event) => {
                    setAgentScope(event.target.value);
                  }}
                  className="widget-input"
                />
              </label>
            </div>

            <label className="snippet-editor-modal__checkbox">
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

        <footer className="snippet-editor-modal__footer">
          <span className="snippet-editor-modal__error">{error ?? ""}</span>
          <div className="snippet-editor-modal__actions">
            <button
              type="button"
              onClick={onClose}
              className="widget-button"
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
              className="widget-button widget-button--accent"
            >
              {mode === "create" ? "创建" : "保存"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
