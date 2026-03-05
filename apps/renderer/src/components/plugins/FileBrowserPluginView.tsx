import { useEffect, useMemo, useState } from "react";
import type { FsEntry } from "@localterm/shared";
import { Button } from "@/components/ui/button";
import type { WidgetRenderContext } from "../../lib/plugins/types";

type FileBrowserState = {
  rootPath: string;
  currentPath: string;
  selectedPath: string | null;
  showHidden: boolean;
};

function normalizeFileBrowserState(state: Record<string, unknown>): FileBrowserState {
  const rootPath = typeof state.rootPath === "string" ? state.rootPath : "";
  const currentPath = typeof state.currentPath === "string" ? state.currentPath : rootPath;
  const selectedPath = typeof state.selectedPath === "string" ? state.selectedPath : null;
  const showHidden = state.showHidden === true;
  return {
    rootPath,
    currentPath,
    selectedPath,
    showHidden
  };
}

function baseName(filePath: string) {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? filePath;
}

function parentDir(dirPath: string, rootPath: string) {
  if (!dirPath) return rootPath;
  if (dirPath === rootPath) return rootPath;
  const normalized = dirPath.replace(/[\\/]+$/, "");
  const splitAt = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (splitAt <= 0) return rootPath;
  return normalized.slice(0, splitAt);
}

export function FileBrowserPluginView(context: WidgetRenderContext) {
  const { state, setState, openWidget } = context;
  const fileState = useMemo(() => normalizeFileBrowserState(state), [state]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!fileState.currentPath) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setErrorText("");
    void window.localtermApi.file
      .readDir({
        dirPath: fileState.currentPath,
        includeHidden: fileState.showHidden
      })
      .then((response) => {
        if (cancelled) return;
        setEntries(response.entries);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorText(message);
        setEntries([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileState.currentPath, fileState.showHidden]);

  const selectedFile = useMemo(() => {
    if (!fileState.selectedPath) return null;
    return entries.find((entry) => entry.path === fileState.selectedPath) ?? null;
  }, [entries, fileState.selectedPath]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto] gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      <div className="flex items-center gap-2 text-xs text-zinc-300">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            const picked = await window.localtermApi.file.pickDirectory();
            if (!picked.path) return;
            setState((prev) => ({
              ...prev,
              rootPath: picked.path,
              currentPath: picked.path,
              selectedPath: null
            }));
          }}
        >
          Choose Folder
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setState((prev) => ({
              ...prev,
              showHidden: !fileState.showHidden
            }));
          }}
          disabled={!fileState.currentPath}
        >
          {fileState.showHidden ? "Hide Dotfiles" : "Show Dotfiles"}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const nextPath = parentDir(fileState.currentPath, fileState.rootPath);
            setState((prev) => ({
              ...prev,
              currentPath: nextPath
            }));
          }}
          disabled={!fileState.currentPath || fileState.currentPath === fileState.rootPath}
        >
          Up
        </Button>
        <span className="truncate">{fileState.currentPath || "(no folder selected)"}</span>
      </div>

      <div className="min-h-0 overflow-auto rounded-md border border-zinc-800 bg-zinc-900/50">
        {loading ? (
          <div className="px-3 py-2 text-xs text-zinc-400">Loading...</div>
        ) : errorText ? (
          <div className="px-3 py-2 text-xs text-red-300">{errorText}</div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-400">No entries</div>
        ) : (
          <ul className="py-1">
            {entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={
                    entry.path === fileState.selectedPath
                      ? "flex w-full items-center justify-between px-3 py-1 text-left text-xs text-zinc-100 bg-zinc-800"
                      : "flex w-full items-center justify-between px-3 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/70"
                  }
                  onClick={() => {
                    if (entry.kind === "directory") {
                      setState((prev) => ({
                        ...prev,
                        currentPath: entry.path,
                        selectedPath: null
                      }));
                      return;
                    }
                    setState((prev) => ({
                      ...prev,
                      selectedPath: entry.path
                    }));
                  }}
                >
                  <span className="truncate">
                    {entry.kind === "directory" ? "[DIR] " : "[FILE] "}
                    {entry.name}
                  </span>
                  {entry.kind === "file" ? (
                    <span className="ml-2 shrink-0 text-[10px] text-zinc-500">
                      {entry.size == null ? "-" : `${entry.size}B`}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-2 text-xs text-zinc-300">
        <span className="truncate">{selectedFile?.path ?? "Select a file to open in markdown view"}</span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!selectedFile}
          onClick={() => {
            if (!selectedFile) return;
            openWidget({
              widgetId: "note.markdown",
              title: baseName(selectedFile.path),
              state: {
                source: "file",
                filePath: selectedFile.path,
                mode: "read"
              }
            });
          }}
        >
          Open Markdown
        </Button>
      </div>
    </div>
  );
}
