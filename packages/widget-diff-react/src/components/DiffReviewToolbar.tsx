import type { DiffReviewFile, TextSelectionInfo } from "../types";

type DiffReviewToolbarProps = {
  selectedFile: DiffReviewFile | null;
  selection: TextSelectionInfo | null;
  statusMessage: string | null;
  onCopyPath: () => void;
  onCopyPathWithName: () => void;
  onCopySelection: () => void;
  onCopyFileAndSelection: () => void;
};

const BUTTON_CLASS =
  "h-8 rounded border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40";

export function DiffReviewToolbar({
  selectedFile,
  selection,
  statusMessage,
  onCopyPath,
  onCopyPathWithName,
  onCopySelection,
  onCopyFileAndSelection
}: DiffReviewToolbarProps) {
  const hasFile = Boolean(selectedFile);
  const hasSelection = Boolean(selection?.text.trim());

  return (
    <header className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-950/70 px-2 py-2">
      <button type="button" onClick={onCopyPath} disabled={!hasFile} className={BUTTON_CLASS}>
        复制文件路径
      </button>
      <button type="button" onClick={onCopyPathWithName} disabled={!hasFile} className={BUTTON_CLASS}>
        复制文件名+路径
      </button>
      <button type="button" onClick={onCopySelection} disabled={!hasSelection} className={BUTTON_CLASS}>
        复制选中文本
      </button>
      <button
        type="button"
        onClick={onCopyFileAndSelection}
        disabled={!hasSelection || !hasFile}
        className={BUTTON_CLASS}
      >
        复制文件信息+选中文本
      </button>
      <span className="ml-auto max-w-full truncate px-1 text-xs text-slate-400">{statusMessage ?? ""}</span>
    </header>
  );
}
