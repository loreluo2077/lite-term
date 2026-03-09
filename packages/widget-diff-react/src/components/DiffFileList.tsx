import { basename } from "../lib/clipboard";
import type { DiffReviewFile } from "../types";

type DiffFileListProps = {
  files: DiffReviewFile[];
  selectedPath: string | null;
  onSelectFile: (filePath: string) => void;
};

function statusClass(status: DiffReviewFile["status"]) {
  if (status === "A") return "border-emerald-600/60 bg-emerald-900/30 text-emerald-300";
  if (status === "D") return "border-red-600/60 bg-red-900/30 text-red-300";
  return "border-amber-600/60 bg-amber-900/30 text-amber-200";
}

export function DiffFileList({ files, selectedPath, onSelectFile }: DiffFileListProps) {
  return (
    <aside className="min-h-0 overflow-auto rounded border border-slate-700 bg-slate-950/70">
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-3 py-2 text-xs text-slate-300">
        改动文件 ({files.length})
      </div>
      <ul className="m-0 list-none p-0">
        {files.map((file) => {
          const active = file.path === selectedPath;
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => {
                  onSelectFile(file.path);
                }}
                className={`grid w-full grid-cols-[auto_1fr] gap-2 border-b border-slate-900 px-3 py-2 text-left hover:bg-slate-900/60 ${
                  active ? "bg-slate-900" : ""
                }`}
              >
                <span
                  className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-semibold ${statusClass(file.status)}`}
                >
                  {file.status}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-slate-100">{basename(file.path)}</span>
                  <span className="block truncate text-[11px] text-slate-400">{file.path}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
