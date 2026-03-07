import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, getWidgetApi } from "./widget-api";

type NoteWidgetState = {
  source: "inline" | "file";
  mode: "edit" | "read";
  content: string;
  filePath: string | null;
};

const DEFAULT_STATE: NoteWidgetState = {
  source: "inline",
  mode: "edit",
  content: "# Notes\n\n",
  filePath: null
};

function basename(filePath: string | null) {
  if (!filePath) return "Markdown";
  const parts = String(filePath).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || "Markdown";
}

function normalizeState(raw: Record<string, unknown> | null | undefined): NoteWidgetState {
  const source = raw ?? {};
  return {
    source: source.source === "file" ? "file" : "inline",
    mode: source.mode === "read" ? "read" : "edit",
    content: typeof source.content === "string" ? source.content : "# Notes\n\n",
    filePath: typeof source.filePath === "string" ? source.filePath : null
  };
}

export default function App() {
  const api = getWidgetApi();
  const [state, setState] = useState<NoteWidgetState>(DEFAULT_STATE);
  const stateRef = useRef<NoteWidgetState>(DEFAULT_STATE);
  const [statusMessage, setStatusMessage] = useState<string>("inline");
  const bootstrappedRef = useRef(false);

  const applyState = useCallback((next: NoteWidgetState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const persistState = useCallback(
    async (nextState: NoteWidgetState) => {
      const normalized = normalizeState(nextState as Record<string, unknown>);
      applyState(normalized);
      await api.state.set(normalized as Record<string, unknown>);
      setStatusMessage(normalized.source === "file" ? normalized.filePath || "(missing file)" : "inline");
    },
    [api, applyState]
  );

  const loadFile = useCallback(
    async (filePath: string) => {
      const response = await api.fs.readFile({
        filePath,
        maxBytes: 1024 * 1024
      });
      const suffix = response.truncated ? "\n\n[truncated]" : "";
      const nextState: NoteWidgetState = {
        ...stateRef.current,
        source: "file",
        filePath,
        mode: "read",
        content: `${response.content}${suffix}`
      };
      await persistState(nextState);
      await api.widget.setTitle(basename(filePath));
    },
    [api, persistState]
  );

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let disposed = false;

    const disposeState = api.state.onDidChange((nextState) => {
      if (disposed) return;
      const normalized = normalizeState(nextState);
      applyState(normalized);
      setStatusMessage(normalized.source === "file" ? normalized.filePath || "(missing file)" : "inline");
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
        setStatusMessage(normalized.source === "file" ? normalized.filePath || "(missing file)" : "inline");

        if (normalized.source === "file" && normalized.filePath) {
          try {
            await loadFile(normalized.filePath);
          } catch (error) {
            setStatusMessage(errorMessage(error));
          }
        }
      } catch (error) {
        setStatusMessage(errorMessage(error));
      }
    })();

    return () => {
      disposed = true;
      disposeState();
    };
  }, [api, applyState, loadFile]);

  const isEditing = state.source === "inline" && state.mode === "edit";

  const handleInline = useCallback(async () => {
    try {
      await persistState({
        ...stateRef.current,
        source: "inline",
        mode: "edit"
      });
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, [persistState]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await api.fs.pickFile({
        filters: [{ name: "Markdown", extensions: ["md", "mdx", "txt"] }]
      });
      if (!selected.path) return;
      await loadFile(selected.path);
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, [api, loadFile]);

  const handleToggleMode = useCallback(async () => {
    const snapshot = stateRef.current;
    if (snapshot.source !== "inline") return;

    try {
      await persistState({
        ...snapshot,
        mode: snapshot.mode === "edit" ? "read" : "edit"
      });
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, [persistState]);

  const handleEditorChange = useCallback(
    async (value: string) => {
      const nextState: NoteWidgetState = {
        ...stateRef.current,
        content: value,
        source: "inline",
        mode: "edit"
      };
      applyState(nextState);
      setStatusMessage("inline");
      try {
        await api.state.patch({
          content: value,
          source: "inline",
          mode: "edit"
        });
      } catch (error) {
        setStatusMessage(errorMessage(error));
      }
    },
    [api, applyState]
  );

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2 bg-[radial-gradient(circle_at_top_right,rgba(58,89,131,0.22),transparent_40%)] bg-zinc-950 p-2 text-[13px] text-zinc-100">
      <section className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleInline()}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 hover:border-sky-500"
        >
          Inline Note
        </button>
        <button
          type="button"
          onClick={() => void handleOpenFile()}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 hover:border-sky-500"
        >
          Open File
        </button>
        <button
          type="button"
          onClick={() => void handleToggleMode()}
          className="h-7 rounded border border-slate-700 bg-slate-900 px-3 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isEditing ? "Read Mode" : "Edit Mode"}
        </button>
        <span className="ml-auto truncate text-slate-400">{statusMessage}</span>
      </section>

      <section className="min-h-0 overflow-hidden rounded border border-slate-700 bg-slate-950">
        {isEditing ? (
          <textarea
            value={state.content}
            spellCheck={false}
            onChange={(event) => {
              void handleEditorChange(event.target.value);
            }}
            className="h-full w-full resize-none border-0 bg-transparent p-3 font-mono text-[12px] leading-6 text-slate-100 outline-none"
          />
        ) : (
          <pre className="h-full overflow-auto whitespace-pre-wrap p-3 font-mono text-[12px] leading-6 text-slate-100">
            {state.content}
          </pre>
        )}
      </section>
    </main>
  );
}
