import { useCallback, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { Diff, Hunk, parseDiff, type ChangeData } from "react-diff-view";
import type { DiffReviewFile, TextSelectionInfo } from "../types";

const OLD_LINE_PREFIX = "line-old-";
const NEW_LINE_PREFIX = "line-new-";

type DiffPreviewPanelProps = {
  file: DiffReviewFile | null;
  onSelectionChange: (selection: TextSelectionInfo | null) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

function statusLabel(status: DiffReviewFile["status"]) {
  if (status === "A") return "新增";
  if (status === "D") return "删除";
  return "修改";
}

function toLineNumber(change: ChangeData) {
  if (change.type === "insert") {
    return {
      oldLine: null,
      newLine: change.lineNumber
    };
  }

  if (change.type === "delete") {
    return {
      oldLine: change.lineNumber,
      newLine: null
    };
  }

  return {
    oldLine: change.oldLineNumber,
    newLine: change.newLineNumber
  };
}

function readPreferredLineNumber(row: HTMLTableRowElement | null) {
  if (!row) return null;

  for (const className of row.classList) {
    if (!className.startsWith(NEW_LINE_PREFIX)) continue;
    const parsed = Number.parseInt(className.slice(NEW_LINE_PREFIX.length), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  for (const className of row.classList) {
    if (!className.startsWith(OLD_LINE_PREFIX)) continue;
    const parsed = Number.parseInt(className.slice(OLD_LINE_PREFIX.length), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function closestDiffRow(node: Node | null) {
  if (!node) return null;
  if (node instanceof Element) {
    return node.closest("tr.diff-line") as HTMLTableRowElement | null;
  }
  return node.parentElement?.closest("tr.diff-line") as HTMLTableRowElement | null;
}

function readSelection(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const text = selection.toString();
  if (!text.trim()) return null;

  const anchorLine = readPreferredLineNumber(closestDiffRow(selection.anchorNode));
  const focusLine = readPreferredLineNumber(closestDiffRow(selection.focusNode));

  let lineStart: number | null = null;
  let lineEnd: number | null = null;

  if (anchorLine != null && focusLine != null) {
    lineStart = Math.min(anchorLine, focusLine);
    lineEnd = Math.max(anchorLine, focusLine);
  } else if (anchorLine != null) {
    lineStart = anchorLine;
    lineEnd = anchorLine;
  } else if (focusLine != null) {
    lineStart = focusLine;
    lineEnd = focusLine;
  }

  return {
    text,
    lineStart,
    lineEnd
  } as TextSelectionInfo;
}

export function DiffPreviewPanel({ file, onSelectionChange, onContextMenu }: DiffPreviewPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const parsedFile = useMemo(() => {
    if (!file?.patch) return null;
    const [first] = parseDiff(file.patch, { nearbySequences: "zip" });
    return first ?? null;
  }, [file?.patch]);

  const handleSelectionCapture = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    onSelectionChange(readSelection(panel));
  }, [onSelectionChange]);

  const generateLineClassName = useCallback(
    ({ changes, defaultGenerate }: { changes: ChangeData[]; defaultGenerate: () => string }) => {
      let oldLine: number | null = null;
      let newLine: number | null = null;

      for (const change of changes) {
        const line = toLineNumber(change);
        if (line.oldLine != null && oldLine == null) oldLine = line.oldLine;
        if (line.newLine != null && newLine == null) newLine = line.newLine;
      }

      const custom = [
        oldLine != null ? `${OLD_LINE_PREFIX}${oldLine}` : "",
        newLine != null ? `${NEW_LINE_PREFIX}${newLine}` : ""
      ]
        .filter(Boolean)
        .join(" ");

      return [defaultGenerate(), custom].filter(Boolean).join(" ");
    },
    []
  );

  useEffect(() => {
    onSelectionChange(null);
  }, [file?.path, onSelectionChange]);

  if (!file) {
    return (
      <section className="diff-preview diff-preview--placeholder" onContextMenu={onContextMenu}>
        请先在左侧选择一个文件。
      </section>
    );
  }

  if (!parsedFile) {
    return (
      <section className="diff-preview diff-preview--error" onContextMenu={onContextMenu}>
        <p className="diff-preview__error-title">无法解析当前 diff，原始内容如下：</p>
        <pre className="diff-preview__error-content">{file.patch}</pre>
      </section>
    );
  }

  return (
    <section
      ref={panelRef}
      className="diff-preview diff-review-panel"
      onMouseUp={handleSelectionCapture}
      onKeyUp={handleSelectionCapture}
      onContextMenu={onContextMenu}
    >
      <div className="diff-preview__header">
        <span className="diff-preview__path">{file.path}</span>
        <span className={`diff-preview__status diff-preview__status--${file.status.toLowerCase()}`}>
          {file.status} · {statusLabel(file.status)}
        </span>
      </div>
      <div className="diff-preview__body">
        <Diff
          viewType="unified"
          diffType={parsedFile.type}
          hunks={parsedFile.hunks}
          generateLineClassName={generateLineClassName}
        >
          {(hunks) =>
            hunks.map((hunk) => (
              <Hunk key={`${hunk.content}-${hunk.oldStart}-${hunk.newStart}`} hunk={hunk} />
            ))
          }
        </Diff>
      </div>
    </section>
  );
}
