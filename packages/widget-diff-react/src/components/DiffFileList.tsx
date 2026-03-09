import type { CSSProperties } from "react";
import { basename } from "../lib/clipboard";
import type { DiffReviewFile } from "../types";

type DiffFileListProps = {
  files: DiffReviewFile[];
  selectedPath: string | null;
  onSelectFile: (filePath: string) => void;
};

function statusClass(status: DiffReviewFile["status"]) {
  if (status === "A") return "diff-file-item__status diff-file-item__status--added";
  if (status === "D") return "diff-file-item__status diff-file-item__status--deleted";
  return "diff-file-item__status diff-file-item__status--modified";
}

export function DiffFileList({ files, selectedPath, onSelectFile }: DiffFileListProps) {
  return (
    <aside className="diff-file-list">
      <div className="diff-file-list__header">
        改动文件 ({files.length})
      </div>
      <ul className="diff-file-list__items">
        {files.map((file, index) => {
          const active = file.path === selectedPath;
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => {
                  onSelectFile(file.path);
                }}
                style={{ "--stagger": index } as CSSProperties}
                className={`diff-file-item ${active ? "is-active" : ""}`}
              >
                <span className={statusClass(file.status)}>
                  {file.status}
                </span>
                <span className="diff-file-item__text">
                  <span className="diff-file-item__name">{basename(file.path)}</span>
                  <span className="diff-file-item__path">{file.path}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
