import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffFileList } from "./components/DiffFileList";
import { DiffPreviewPanel } from "./components/DiffPreviewPanel";
import { DiffReviewToolbar } from "./components/DiffReviewToolbar";
import {
  copyTextToClipboard,
  formatFileInfoAndSelection,
  formatFileReference
} from "./lib/clipboard";
import { SAMPLE_DIFF_FILES } from "./sample-data";
import type {
  DiffFileStatus,
  DiffReviewFile,
  DiffReviewWidgetState,
  TextSelectionInfo
} from "./types";
import { errorMessage, getWidgetApi } from "./widget-api";

const DEFAULT_STATE: DiffReviewWidgetState = {
  files: SAMPLE_DIFF_FILES,
  selectedPath: SAMPLE_DIFF_FILES[0]?.path ?? null
};

function isValidStatus(value: unknown): value is DiffFileStatus {
  return value === "A" || value === "M" || value === "D";
}

function toDiffFile(value: unknown): DiffReviewFile | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.path !== "string") return null;
  if (typeof source.patch !== "string") return null;
  if (!isValidStatus(source.status)) return null;

  return {
    path: source.path,
    patch: source.patch,
    status: source.status
  };
}

function normalizeState(raw: Record<string, unknown> | null | undefined): DiffReviewWidgetState {
  const source = raw ?? {};
  const files = Array.isArray(source.files)
    ? source.files
        .map((entry) => toDiffFile(entry))
        .filter((entry): entry is DiffReviewFile => entry != null)
    : [];

  const normalizedFiles = files.length > 0 ? files : SAMPLE_DIFF_FILES;
  const selectedPathFromState = typeof source.selectedPath === "string" ? source.selectedPath : null;
  const selectedPath = normalizedFiles.some((file) => file.path === selectedPathFromState)
    ? selectedPathFromState
    : normalizedFiles[0]?.path ?? null;

  return {
    files: normalizedFiles,
    selectedPath
  };
}

export default function App() {
  const api = getWidgetApi();
  const [state, setState] = useState<DiffReviewWidgetState>(DEFAULT_STATE);
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const stateRef = useRef<DiffReviewWidgetState>(DEFAULT_STATE);
  const bootstrappedRef = useRef(false);

  const applyState = useCallback((next: DiffReviewWidgetState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let disposed = false;

    const disposeState = api.state.onDidChange((nextState) => {
      if (disposed) return;
      applyState(normalizeState(nextState));
      setSelection(null);
    });

    void (async () => {
      try {
        const context = await api.widget.getContext();
        if (context?.tabTitle) {
          document.title = context.tabTitle;
        }

        const stored = await api.state.get();
        if (disposed) return;
        applyState(normalizeState(stored));
      } catch (nextError) {
        if (disposed) return;
        setStatusMessage(errorMessage(nextError));
      }
    })();

    return () => {
      disposed = true;
      disposeState();
    };
  }, [api, applyState]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => {
      setStatusMessage(null);
    }, 2200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [statusMessage]);

  const selectedFile = useMemo(() => {
    if (!state.selectedPath) return state.files[0] ?? null;
    return state.files.find((file) => file.path === state.selectedPath) ?? state.files[0] ?? null;
  }, [state.files, state.selectedPath]);

  const selectFile = useCallback(
    async (filePath: string) => {
      const next = {
        ...stateRef.current,
        selectedPath: filePath
      };
      applyState(next);
      setSelection(null);

      try {
        await api.state.patch({ selectedPath: filePath });
      } catch (nextError) {
        setStatusMessage(errorMessage(nextError));
      }
    },
    [api, applyState]
  );

  const copyWithStatus = useCallback(async (value: string, successMessage: string) => {
    try {
      await copyTextToClipboard(value);
      setStatusMessage(successMessage);
    } catch (nextError) {
      setStatusMessage(`复制失败: ${errorMessage(nextError)}`);
    }
  }, []);

  const handleCopyPath = useCallback(() => {
    if (!selectedFile) return;
    void copyWithStatus(selectedFile.path, "文件路径已复制");
  }, [copyWithStatus, selectedFile]);

  const handleCopyPathWithName = useCallback(() => {
    if (!selectedFile) return;
    void copyWithStatus(formatFileReference(selectedFile), "文件引用已复制");
  }, [copyWithStatus, selectedFile]);

  const handleCopySelection = useCallback(() => {
    if (!selection) return;
    void copyWithStatus(selection.text, "选中文本已复制");
  }, [copyWithStatus, selection]);

  const handleCopyFileAndSelection = useCallback(() => {
    if (!selectedFile || !selection) return;
    void copyWithStatus(
      formatFileInfoAndSelection(selectedFile, selection),
      "文件信息与摘录已复制"
    );
  }, [copyWithStatus, selectedFile, selection]);

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2 bg-[radial-gradient(circle_at_top_left,rgba(54,92,150,0.18),transparent_45%)] bg-zinc-950 p-2 text-zinc-100">
      <DiffReviewToolbar
        selectedFile={selectedFile}
        selection={selection}
        statusMessage={statusMessage}
        onCopyPath={handleCopyPath}
        onCopyPathWithName={handleCopyPathWithName}
        onCopySelection={handleCopySelection}
        onCopyFileAndSelection={handleCopyFileAndSelection}
      />

      <section className="grid min-h-0 grid-cols-1 gap-2 md:grid-cols-[280px_1fr]">
        <DiffFileList files={state.files} selectedPath={selectedFile?.path ?? null} onSelectFile={selectFile} />
        <DiffPreviewPanel file={selectedFile} onSelectionChange={setSelection} />
      </section>
    </main>
  );
}
