import type { SnippetFilterKind, SnippetSortKind } from "../types";

type SnippetFiltersProps = {
  query: string;
  filter: SnippetFilterKind;
  sort: SnippetSortKind;
  workspaceName: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: SnippetFilterKind) => void;
  onSortChange: (value: SnippetSortKind) => void;
};

const FILTERS: Array<{ key: SnippetFilterKind; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pinned", label: "收藏" },
  { key: "command", label: "command" },
  { key: "prompt", label: "prompt" },
  { key: "command_prompt", label: "command_prompt" },
  { key: "template", label: "template" },
  { key: "current_project", label: "当前项目" }
];

export function SnippetFilters({
  query,
  filter,
  sort,
  workspaceName,
  onQueryChange,
  onFilterChange,
  onSortChange
}: SnippetFiltersProps) {
  return (
    <section className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          placeholder="搜索命令、prompt、标签或内容"
          className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-500"
        />
        <select
          value={sort}
          onChange={(event) => {
            onSortChange(event.target.value as SnippetSortKind);
          }}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-200 outline-none focus:border-sky-500"
          title="排序"
        >
          <option value="smart">智能排序</option>
          <option value="updated">最近更新</option>
          <option value="used">使用最多</option>
          <option value="title">按标题</option>
        </select>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {FILTERS.map((entry) => {
          const active = filter === entry.key;
          const title =
            entry.key === "current_project" ? `当前项目: ${workspaceName || "(未知)"}` : entry.label;
          return (
            <button
              key={entry.key}
              type="button"
              title={title}
              onClick={() => {
                onFilterChange(entry.key);
              }}
              className={`h-7 rounded-full border px-2.5 text-[11px] ${
                active
                  ? "border-sky-500 bg-sky-900/50 text-sky-100"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
