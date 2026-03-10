import type { CommandSnippet } from "../types";

type SnippetDetailProps = {
  snippet: CommandSnippet | null;
  terminalActionAvailable: boolean;
  terminalHint: string;
  insertingTerminal: boolean;
  onCopyContent: () => void;
  onCopyTitleAndContent: () => void;
  onInsertTerminal: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

export function SnippetDetail({
  snippet,
  terminalActionAvailable,
  terminalHint,
  insertingTerminal,
  onCopyContent,
  onCopyTitleAndContent,
  onInsertTerminal,
  onEdit,
  onDelete
}: SnippetDetailProps) {
  if (!snippet) {
    return (
      <section className="snippet-detail snippet-detail--empty">请选择一个 snippet 查看详情</section>
    );
  }

  return (
    <section className="snippet-detail">
      <div className="snippet-detail__header">
        <div className="snippet-detail__title-block">
          <h3 className="snippet-detail__title">{snippet.title}</h3>
          <p className="snippet-detail__type">{snippet.type}</p>
        </div>
        {snippet.isPinned ? <span className="widget-chip">置顶</span> : null}
      </div>

      <div className="snippet-detail__meta-grid">
        <span>标签: {snippet.tags.length > 0 ? snippet.tags.join(", ") : "-"}</span>
        <span>项目: {snippet.projectScope || "-"}</span>
        <span>Agent: {snippet.agentScope || "-"}</span>
        <span>使用次数: {snippet.usageCount}</span>
        <span className="snippet-detail__meta-full">最近使用: {formatTime(snippet.lastUsedAt)}</span>
      </div>

      <pre className="widget-code snippet-detail__content">
        {snippet.content}
      </pre>

      <div className="snippet-detail__footer">
        <div className="snippet-detail__actions">
          <button type="button" onClick={onCopyContent} className="widget-button">
            复制内容
          </button>
          <button type="button" onClick={onCopyTitleAndContent} className="widget-button">
            复制标题+内容
          </button>
          <button
            type="button"
            onClick={onInsertTerminal}
            disabled={!terminalActionAvailable || insertingTerminal}
            className="widget-button"
          >
            {insertingTerminal ? "插入中..." : "插入终端"}
          </button>
          <button type="button" onClick={onEdit} className="widget-button">
            编辑
          </button>
          <button type="button" onClick={onDelete} className="widget-button widget-button--danger">
            删除
          </button>
        </div>
        <div className="snippet-detail__hint">{terminalHint}</div>
      </div>
    </section>
  );
}
