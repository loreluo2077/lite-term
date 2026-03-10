import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { WidgetHeader, WidgetPanel, WidgetShell, WidgetStatusBar, WidgetTitleBlock } from "@localterm/widget-ui-react";
import { DiffRepoToolbar } from "./components/DiffRepoToolbar";
import { DiffFileList } from "./components/DiffFileList";
import { DiffPreviewPanel } from "./components/DiffPreviewPanel";
import {
  copyTextToClipboard,
  formatFileInfoAndSelection,
  formatFileReference
} from "./lib/clipboard";
import type {
  DiffFileStatus,
  DiffReviewFile,
  DiffReviewWidgetState,
  TextSelectionInfo
} from "./types";
import { errorMessage, getWidgetApi } from "./widget-api";

const DEFAULT_STATE: DiffReviewWidgetState = {
  repoPath: null,
  files: [],
  selectedPath: null,
  lastLoadedAt: null
};

type ContextMenuState = {
  x: number;
  y: number;
} | null;

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

  const normalizedFiles = files;
  const repoPath = typeof source.repoPath === "string" && source.repoPath.trim()
    ? source.repoPath.trim()
    : null;
  const selectedPathFromState = typeof source.selectedPath === "string" ? source.selectedPath : null;
  const selectedPath = normalizedFiles.some((file) => file.path === selectedPathFromState)
    ? selectedPathFromState
    : normalizedFiles[0]?.path ?? null;
  const lastLoadedAt =
    typeof source.lastLoadedAt === "string" && source.lastLoadedAt
      ? source.lastLoadedAt
      : null;

  return {
    repoPath,
    files: normalizedFiles,
    selectedPath,
    lastLoadedAt
  };
}

function clampContextMenuPosition(clientX: number, clientY: number) {
  const menuWidth = 208;
  const menuHeight = 200;
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8))
  };
}

export default function App() {
  const api = getWidgetApi();
  const [state, setState] = useState<DiffReviewWidgetState>(DEFAULT_STATE);
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const stateRef = useRef<DiffReviewWidgetState>(DEFAULT_STATE);
  const bootstrappedRef = useRef(false);

  const applyState = useCallback((next: DiffReviewWidgetState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const replaceState = useCallback(
    async (nextState: DiffReviewWidgetState) => {
      applyState(nextState);
      await api.state.set(nextState as Record<string, unknown>);
    },
    [api, applyState]
  );

  const loadRepoDiff = useCallback(
    async (repoSourcePath: string) => {
      setIsRefreshing(true);
      try {
        const response = await api.git.readDiff({ path: repoSourcePath });
        const currentSelectedPath = stateRef.current.selectedPath;
        const nextState: DiffReviewWidgetState = {
          repoPath: response.repoPath,
          files: response.files,
          selectedPath: response.files.some((file) => file.path === currentSelectedPath)
            ? currentSelectedPath
            : response.files[0]?.path ?? null,
          lastLoadedAt: new Date().toISOString()
        };
        await replaceState(nextState);
        setSelection(null);
        setStatusMessage(
          response.files.length > 0
            ? `已加载 ${response.files.length} 个改动文件`
            : "当前仓库没有可展示的改动"
        );
      } catch (nextError) {
        setStatusMessage(errorMessage(nextError));
      } finally {
        setIsRefreshing(false);
      }
    },
    [api, replaceState]
  );

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
        const normalized = normalizeState(stored);
        applyState(normalized);
        const repoPath = normalized.repoPath ?? context?.workspaceRootPath ?? null;
        if (repoPath && repoPath !== normalized.repoPath) {
          await api.state.patch({ repoPath });
        }
        if (repoPath) {
          void loadRepoDiff(repoPath);
        }
      } catch (nextError) {
        if (disposed) return;
        setStatusMessage(errorMessage(nextError));
      }
    })();

    return () => {
      disposed = true;
      disposeState();
    };
  }, [api, applyState, loadRepoDiff]);

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
  const hasSelection = Boolean(selection?.text.trim());

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
    if (!selection || !selection.text.trim()) return;
    void copyWithStatus(selection.text, "选中文本已复制");
  }, [copyWithStatus, selection]);

  const handleCopyFileAndSelection = useCallback(() => {
    if (!selectedFile || !selection || !selection.text.trim()) return;
    void copyWithStatus(
      formatFileInfoAndSelection(selectedFile, selection),
      "文件信息与摘录已复制"
    );
  }, [copyWithStatus, selectedFile, selection]);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    setContextMenu(clampContextMenuPosition(event.clientX, event.clientY));
  }, []);

  const handleChooseRepo = useCallback(async () => {
    try {
      const selected = await api.fs.pickDirectory();
      if (!selected.path) return;
      await loadRepoDiff(selected.path);
    } catch (nextError) {
      setStatusMessage(errorMessage(nextError));
    }
  }, [api, loadRepoDiff]);

  const handleRefresh = useCallback(() => {
    const repoPath = stateRef.current.repoPath;
    if (!repoPath) return;
    void loadRepoDiff(repoPath);
  }, [loadRepoDiff]);

  useEffect(() => {
    if (!contextMenu) return;

    const dismiss = () => {
      setContextMenu(null);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".diff-context-menu")) return;
      dismiss();
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [contextMenu]);

  const runMenuAction = useCallback((action: () => void) => {
    setContextMenu(null);
    action();
  }, []);

  return (
    <WidgetShell className="diff-review-shell">
      <WidgetHeader>
        <WidgetTitleBlock
          eyebrow="Review"
          title="Approval Diff"
          subtitle={state.repoPath ? `${state.files.length} files changed` : "选择 Git 仓库后查看当前改动"}
        />
        <DiffRepoToolbar
          repoPath={state.repoPath}
          isRefreshing={isRefreshing}
          onChooseRepo={() => {
            void handleChooseRepo();
          }}
          onRefresh={handleRefresh}
        />
      </WidgetHeader>
      <section className="diff-review-layout">
        <WidgetPanel>
          <DiffFileList files={state.files} selectedPath={selectedFile?.path ?? null} onSelectFile={selectFile} />
        </WidgetPanel>
        <WidgetPanel tone="muted">
          <DiffPreviewPanel
            file={selectedFile}
            emptyMessage={
              state.repoPath
                ? "当前仓库没有可展示的 diff，或还没有选择文件。"
                : "先选择一个 Git 仓库目录。"
            }
            onSelectionChange={setSelection}
            onContextMenu={handleContextMenu}
          />
        </WidgetPanel>
      </section>

      <WidgetStatusBar message={statusMessage ?? "右键打开菜单，可复制路径与摘录"} />

      {contextMenu ? (
        <div
          className="diff-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="diff-context-menu__item"
            onClick={() => {
              runMenuAction(handleCopyPath);
            }}
            disabled={!selectedFile}
          >
            复制文件路径
          </button>
          <button
            type="button"
            className="diff-context-menu__item"
            onClick={() => {
              runMenuAction(handleCopyPathWithName);
            }}
            disabled={!selectedFile}
          >
            复制文件名+路径
          </button>
          <button
            type="button"
            className="diff-context-menu__item"
            onClick={() => {
              runMenuAction(handleCopySelection);
            }}
            disabled={!hasSelection}
          >
            复制选中文本
          </button>
          <button
            type="button"
            className="diff-context-menu__item"
            onClick={() => {
              runMenuAction(handleCopyFileAndSelection);
            }}
            disabled={!selectedFile || !hasSelection}
          >
            复制文件信息+选中文本
          </button>
        </div>
      ) : null}
    </WidgetShell>
  );
}
