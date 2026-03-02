import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PluginViewRenderContext } from "../../lib/plugins/types";

type MarkdownState = {
  source: "inline" | "file";
  filePath: string | null;
  content: string;
  mode: "read" | "edit";
};

function normalizeMarkdownState(state: Record<string, unknown>): MarkdownState {
  const source = state.source === "file" ? "file" : "inline";
  const filePath = typeof state.filePath === "string" ? state.filePath : null;
  const content = typeof state.content === "string" ? state.content : "# Notes\n\n";
  const mode = state.mode === "edit" ? "edit" : "read";
  return {
    source,
    filePath,
    content,
    mode
  };
}

function fileBaseName(filePath: string | null) {
  if (!filePath) return "Markdown";
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

export function MarkdownPluginView(context: PluginViewRenderContext) {
  const { state, setState, setTitle } = context;
  const markdownState = useMemo(() => normalizeMarkdownState(state), [state]);
  const [displayContent, setDisplayContent] = useState(markdownState.content);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (markdownState.source === "inline") {
      setDisplayContent(markdownState.content);
      setErrorText("");
      return;
    }
    if (!markdownState.filePath) {
      setDisplayContent("");
      setErrorText("No file selected");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorText("");

    void window.localtermApi.file
      .readFile({
        filePath: markdownState.filePath,
        maxBytes: 1024 * 1024
      })
      .then((response) => {
        if (cancelled) return;
        const suffix = response.truncated ? "\n\n[truncated]" : "";
        setDisplayContent(response.content + suffix);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorText(message);
        setDisplayContent("");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [markdownState.filePath, markdownState.source, markdownState.content]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <Button
          size="sm"
          variant={markdownState.source === "inline" ? "secondary" : "ghost"}
          onClick={() => {
            setState((prev) => ({
              ...prev,
              source: "inline",
              mode: "edit"
            }));
          }}
        >
          Inline Note
        </Button>
        <Button
          size="sm"
          variant={markdownState.source === "file" ? "secondary" : "ghost"}
          onClick={async () => {
            const selected = await window.localtermApi.file.pickFile({
              filters: [{ name: "Markdown", extensions: ["md", "mdx", "txt"] }]
            });
            if (!selected.path) return;
            setState((prev) => ({
              ...prev,
              source: "file",
              filePath: selected.path,
              mode: "read"
            }));
            setTitle(fileBaseName(selected.path));
          }}
        >
          Open File
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={markdownState.source !== "inline"}
          onClick={() => {
            setState((prev) => ({
              ...prev,
              mode: markdownState.mode === "edit" ? "read" : "edit",
              content: displayContent
            }));
          }}
        >
          {markdownState.mode === "edit" ? "Read Mode" : "Edit Mode"}
        </Button>
        <span className="truncate text-zinc-400">
          {markdownState.source === "file" ? markdownState.filePath ?? "(missing file)" : "inline notes"}
        </span>
      </div>

      <div className="min-h-0 overflow-auto rounded-md border border-zinc-800 bg-zinc-900/50">
        {loading ? (
          <div className="px-3 py-2 text-xs text-zinc-400">Loading...</div>
        ) : errorText ? (
          <div className="px-3 py-2 text-xs text-red-300">{errorText}</div>
        ) : markdownState.source === "inline" && markdownState.mode === "edit" ? (
          <textarea
            className="h-full min-h-[220px] w-full resize-none bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
            value={displayContent}
            onChange={(event) => {
              const next = event.target.value;
              setDisplayContent(next);
              setState((prev) => ({
                ...prev,
                source: "inline",
                content: next,
                mode: "edit"
              }));
            }}
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-zinc-100">
            {displayContent}
          </pre>
        )}
      </div>
    </div>
  );
}
