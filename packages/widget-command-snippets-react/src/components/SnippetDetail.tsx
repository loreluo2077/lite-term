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
      <section className="grid min-h-0 place-items-center rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-500">
        请选择一个 snippet 查看详情
      </section>
    );
  }

  return (
    <section className="grid min-h-0 grid-rows-[auto_auto_1fr_auto] rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-sm font-semibold text-zinc-100">{snippet.title}</h3>
          <p className="mt-1 text-[11px] text-zinc-400">{snippet.type}</p>
        </div>
        {snippet.isPinned ? <span className="text-xs text-amber-300">置顶</span> : null}
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
        <span>标签: {snippet.tags.length > 0 ? snippet.tags.join(", ") : "-"}</span>
        <span>项目: {snippet.projectScope || "-"}</span>
        <span>Agent: {snippet.agentScope || "-"}</span>
        <span>使用次数: {snippet.usageCount}</span>
        <span className="col-span-2">最近使用: {formatTime(snippet.lastUsedAt)}</span>
      </div>

      <pre className="mt-2 min-h-0 overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-[12px] leading-5 text-zinc-200">
        {snippet.content}
      </pre>

      <div className="mt-2">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={onCopyContent} className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 hover:border-sky-500">
            复制内容
          </button>
          <button type="button" onClick={onCopyTitleAndContent} className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 hover:border-sky-500">
            复制标题+内容
          </button>
          <button
            type="button"
            onClick={onInsertTerminal}
            disabled={!terminalActionAvailable || insertingTerminal}
            className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {insertingTerminal ? "插入中..." : "插入终端"}
          </button>
          <button type="button" onClick={onEdit} className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 hover:border-sky-500">
            编辑
          </button>
          <button type="button" onClick={onDelete} className="h-8 rounded border border-red-900 bg-red-950 px-2.5 text-xs text-red-100 hover:border-red-700">
            删除
          </button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">{terminalHint}</div>
      </div>
    </section>
  );
}
