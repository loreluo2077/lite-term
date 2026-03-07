import { useCallback, useEffect, useRef, useState } from "react";
import type { FsEntry } from "@localterm/shared";
import { errorMessage, getWidgetApi } from "./widget-api";

type FileWidgetState = {
  rootPath: string;
  currentPath: string;
  selectedPath: string | null;
  showHidden: boolean;
};

const DEFAULT_STATE: FileWidgetState = {
  rootPath: "",
  currentPath: "",
  selectedPath: null,
  showHidden: false
};

function normalizeState(raw: Record<string, unknown> | null | undefined): FileWidgetState {
  const source = raw ?? {};
  const rootPath = typeof source.rootPath === "string" ? source.rootPath : "";
  const currentPath = typeof source.currentPath === "string" ? source.currentPath : rootPath;
  const selectedPath = typeof source.selectedPath === "string" ? source.selectedPath : null;
  const showHidden = source.showHidden === true;
  return {
    rootPath,
    currentPath,
    selectedPath,
    showHidden
  };
}

function parentDir(dirPath: string, rootPath: string) {
  if (!dirPath) return rootPath;
  if (dirPath === rootPath) return rootPath;
  const normalized = dirPath.replace(/[\\/]+$/, "");
  const splitAt = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (splitAt <= 0) return rootPath;
  return normalized.slice(0, splitAt);
}

function basename(filePath: string) {
  const parts = String(filePath).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || filePath;
}

export default function App() {
  const api = getWidgetApi();
  const [state, setState] = useState<FileWidgetState>(DEFAULT_STATE);
  const stateRef = useRef<FileWidgetState>(DEFAULT_STATE);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const applyState = useCallback((next: FileWidgetState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const saveState = useCallback(
    async (nextState: FileWidgetState) => {
      const normalized = normalizeState(nextState as Record<string, unknown>);
      applyState(normalized);
      await api.state.set(normalized as Record<string, unknown>);
    },
    [api, applyState]
  );

  const refreshEntries = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!snapshot.currentPath) {
      setEntries([]);
      setError(null);
      return;
    }

    try {
      const response = await api.fs.readDir({
        dirPath: snapshot.currentPath,
        includeHidden: snapshot.showHidden
      });
      setEntries(response.entries || []);
      setError(null);
    } catch (nextError) {
      setEntries([]);
      setError(errorMessage(nextError));
    }
  }, [api]);

  useEffect(() => {
    void refreshEntries();
  }, [refreshEntries, state.currentPath, state.showHidden]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let disposed = false;

    const disposeState = api.state.onDidChange((nextState) => {
      if (disposed) return;
      applyState(normalizeState(nextState));
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
        setError(errorMessage(nextError));
      }
    })();

    return () => {
      disposed = true;
      disposeState();
    };
  }, [api, applyState]);

  const handleChoose = useCallback(async () => {
    try {
      const selected = await api.fs.pickDirectory();
      if (!selected.path) return;
      await saveState({
        rootPath: selected.path,
        currentPath: selected.path,
        selectedPath: null,
        showHidden: stateRef.current.showHidden
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api, saveState]);

  const handleUp = useCallback(async () => {
    const snapshot = stateRef.current;
    const nextPath = parentDir(snapshot.currentPath, snapshot.rootPath);
    try {
      await saveState({
        ...snapshot,
        currentPath: nextPath,
        selectedPath: null
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [saveState]);

  const handleToggleHidden = useCallback(async () => {
    const snapshot = stateRef.current;
    try {
      await saveState({
        ...snapshot,
        showHidden: !snapshot.showHidden
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [saveState]);

  const handleEntryClick = useCallback(
    async (entry: FsEntry) => {
      const snapshot = stateRef.current;
      try {
        if (entry.kind === "directory") {
          await saveState({
            ...snapshot,
            currentPath: entry.path,
            selectedPath: null
          });
          return;
        }

        await saveState({
          ...snapshot,
          selectedPath: entry.path
        });
      } catch (nextError) {
        setError(errorMessage(nextError));
      }
    },
    [saveState]
  );

  const handleOpenMarkdown = useCallback(async () => {
    if (!state.selectedPath) return;
    try {
      await api.widget.openWidget({
        widgetId: "note.markdown",
        title: basename(state.selectedPath),
        state: {
          source: "file",
          filePath: state.selectedPath,
          mode: "read"
        }
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api, state.selectedPath]);

  const selectedText = error ?? state.selectedPath ?? "Select a file to open in markdown widget";
  const pathText = state.currentPath || "(no folder selected)";

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] gap-2 bg-[radial-gradient(circle_at_top_right,rgba(80,122,92,0.24),transparent_38%)] bg-zinc-950 p-2 text-[13px] text-zinc-100">
      <section className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleChoose()}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 hover:border-sky-500"
        >
          Choose Folder
        </button>
        <button
          type="button"
          onClick={() => void handleUp()}
          disabled={!state.currentPath || state.currentPath === state.rootPath}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:border-sky-500"
        >
          Up
        </button>
        <button
          type="button"
          onClick={() => void handleToggleHidden()}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 hover:border-sky-500"
        >
          {state.showHidden ? "Hide Dotfiles" : "Show Dotfiles"}
        </button>
        <span className="ml-auto truncate text-slate-400">{pathText}</span>
      </section>

      <section className="min-h-0 overflow-auto rounded border border-slate-700 bg-slate-950">
        {!state.currentPath ? (
          <div className="p-3 text-slate-400">Choose a folder to browse files.</div>
        ) : entries.length === 0 ? (
          <div className="p-3 text-slate-400">No entries</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {entries.map((entry) => {
              const selected = entry.path === state.selectedPath;
              return (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => void handleEntryClick(entry)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-900 ${
                      selected ? "bg-slate-800" : ""
                    }`}
                  >
                    <span className="truncate">
                      {entry.kind === "directory" ? "[DIR]" : "[FILE]"} {entry.name}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-slate-400">
                      {entry.kind === "file" && entry.size != null ? `${entry.size}B` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/50 px-3 py-2">
        <span className="flex-1 truncate text-slate-300">{selectedText}</span>
        <button
          type="button"
          onClick={() => void handleOpenMarkdown()}
          disabled={!state.selectedPath}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:border-sky-500"
        >
          Open Markdown
        </button>
      </section>
    </main>
  );
}
