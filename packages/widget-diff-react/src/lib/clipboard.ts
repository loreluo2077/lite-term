import type { DiffReviewFile, TextSelectionInfo } from "../types";

export async function copyTextToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

export function basename(filePath: string) {
  const parts = String(filePath).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || filePath;
}

export function formatFileReference(file: DiffReviewFile) {
  return `${basename(file.path)} (${file.path})`;
}

export function formatFileInfoAndSelection(file: DiffReviewFile, selection: TextSelectionInfo) {
  const lines = [
    `文件: ${file.path}`,
    `文件名: ${basename(file.path)}`
  ];

  if (selection.lineStart != null && selection.lineEnd != null) {
    const start = Math.min(selection.lineStart, selection.lineEnd);
    const end = Math.max(selection.lineStart, selection.lineEnd);
    lines.push(`行号: ${start === end ? String(start) : `${start}-${end}`}`);
  }

  lines.push("", "摘录:", selection.text);
  return lines.join("\n");
}
