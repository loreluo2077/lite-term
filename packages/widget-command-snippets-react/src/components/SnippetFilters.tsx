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
    <section className="snippet-filters">
      <div className="snippet-filters__row">
        <input
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          placeholder="搜索命令、prompt、标签或内容"
          className="widget-input"
        />
        <select
          value={sort}
          onChange={(event) => {
            onSortChange(event.target.value as SnippetSortKind);
          }}
          className="widget-select snippet-filters__sort"
          title="排序"
        >
          <option value="smart">智能排序</option>
          <option value="updated">最近更新</option>
          <option value="used">使用最多</option>
          <option value="title">按标题</option>
        </select>
      </div>

      <div className="snippet-filters__pills">
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
              className={active ? "widget-pill widget-pill--active" : "widget-pill"}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
