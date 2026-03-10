type DiffRepoToolbarProps = {
  repoPath: string | null;
  isRefreshing: boolean;
  onChooseRepo: () => void;
  onRefresh: () => void;
};

export function DiffRepoToolbar({
  repoPath,
  isRefreshing,
  onChooseRepo,
  onRefresh
}: DiffRepoToolbarProps) {
  return (
    <section className="diff-review-toolbar">
      <div className="diff-review-toolbar__meta">
        <span className="diff-review-toolbar__label">Git Repo</span>
        <span className="diff-review-toolbar__path">
          {repoPath ?? "未选择仓库目录"}
        </span>
      </div>
      <div className="diff-review-toolbar__actions">
        <button
          type="button"
          className="widget-button"
          onClick={onChooseRepo}
        >
          Choose Repo
        </button>
        <button
          type="button"
          className="widget-button"
          onClick={onRefresh}
          disabled={!repoPath || isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </section>
  );
}
