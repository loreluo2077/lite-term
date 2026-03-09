export type DiffFileStatus = "A" | "M" | "D";

export type DiffReviewFile = {
  path: string;
  status: DiffFileStatus;
  patch: string;
};

export type DiffReviewWidgetState = {
  files: DiffReviewFile[];
  selectedPath: string | null;
};

export type TextSelectionInfo = {
  text: string;
  lineStart: number | null;
  lineEnd: number | null;
};
