import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WidgetHeader,
  WidgetHeaderActions,
  WidgetPanel,
  WidgetShell,
  WidgetStatusBar,
  WidgetTitleBlock
} from "@localterm/widget-ui-react";
import { SnippetDetail } from "./components/SnippetDetail";
import { SnippetEditorModal } from "./components/SnippetEditorModal";
import { SnippetFilters } from "./components/SnippetFilters";
import { SnippetList } from "./components/SnippetList";
import { copyTextToClipboard } from "./lib/clipboard";
import {
  createSnippetFromDraft,
  formatSnippetTitleAndContent,
  matchSnippet,
  normalizeWidgetState,
  sortSnippets,
  touchSnippetUsage,
  updateSnippetFromDraft
} from "./lib/snippet-utils";
import type {
  CommandSnippet,
  CommandSnippetsWidgetState,
  SnippetDraftInput,
  SnippetFilterKind,
  SnippetSortKind
} from "./types";
import { errorMessage, getWidgetApi } from "./widget-api";

const DEFAULT_STATE: CommandSnippetsWidgetState = {
  snippets: []
};

type EditorState = {
  open: boolean;
  mode: "create" | "edit";
  snippetId: string | null;
};

type TerminalTargetResult = {
  sessionId: string | null;
  fromActive: boolean;
  hint: string;
};

function resolveSnippetIndex(snippets: CommandSnippet[], snippetId: string | null) {
  if (!snippetId) return -1;
  return snippets.findIndex((entry) => entry.id === snippetId);
}

export default function App() {
  const api = getWidgetApi();
  const [workspaceName, setWorkspaceName] = useState("current-workspace");
  const [snippets, setSnippets] = useState<CommandSnippet[]>(DEFAULT_STATE.snippets);
  const snippetsRef = useRef<CommandSnippet[]>(DEFAULT_STATE.snippets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SnippetFilterKind>("all");
  const [sort, setSort] = useState<SnippetSortKind>("smart");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [terminalHint, setTerminalHint] = useState("检测终端可用性...");
  const [terminalActionAvailable, setTerminalActionAvailable] = useState(false);
  const [insertingTerminal, setInsertingTerminal] = useState(false);
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: "create",
    snippetId: null
  });
  const bootstrappedRef = useRef(false);

  const applySnippets = useCallback((next: CommandSnippet[]) => {
    snippetsRef.current = next;
    setSnippets(next);
  }, []);

  const persistSnippets = useCallback(
    async (next: CommandSnippet[]) => {
      applySnippets(next);
      await api.state.patch({ snippets: next });
    },
    [api, applySnippets]
  );

  const resolveTerminalTarget = useCallback(async (): Promise<TerminalTargetResult> => {
    const tabs = await api.workspace.listTabs();
    const activeTerminalTab = tabs.find(
      (entry) =>
        entry.isActive === true &&
        entry.extensionId === "builtin.workspace" &&
        entry.widgetId === "terminal.local" &&
        typeof entry.sessionId === "string" &&
        entry.sessionId.length > 0
    );

    if (activeTerminalTab?.sessionId) {
      return {
        sessionId: activeTerminalTab.sessionId,
        fromActive: true,
        hint: "将插入到当前激活 terminal"
      };
    }

    const sessions = await api.terminal.list();
    const readySessions = sessions.filter((entry) => entry.status === "ready");
    if (readySessions.length === 0) {
      return {
        sessionId: null,
        fromActive: false,
        hint: "当前没有可用 terminal"
      };
    }

    if (readySessions.length === 1) {
      return {
        sessionId: readySessions[0]?.sessionId ?? null,
        fromActive: false,
        hint: "未定位到激活 terminal，已使用唯一可用 session"
      };
    }

    return {
      sessionId: readySessions[0]?.sessionId ?? null,
      fromActive: false,
      hint: `未定位到激活 terminal，已使用第一个可用 session（${readySessions.length} 个）`
    };
  }, [api]);

  const refreshTerminalAvailability = useCallback(async () => {
    try {
      const target = await resolveTerminalTarget();
      setTerminalActionAvailable(Boolean(target.sessionId));
      setTerminalHint(target.hint);
    } catch (error) {
      setTerminalActionAvailable(false);
      setTerminalHint(`检测失败: ${errorMessage(error)}`);
    }
  }, [resolveTerminalTarget]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => {
      setStatusMessage(null);
    }, 2300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [statusMessage]);

  useEffect(() => {
    void api.widget.setTitle(`Command Snippets (${snippets.length})`).catch(() => undefined);
  }, [api, snippets.length]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let disposed = false;

    const disposeState = api.state.onDidChange((nextState) => {
      if (disposed) return;
      const normalized = normalizeWidgetState(nextState);
      applySnippets(normalized.snippets);
    });

    void (async () => {
      try {
        const context = await api.widget.getContext();
        if (context?.workspaceName) {
          setWorkspaceName(context.workspaceName);
        }

        const stored = await api.state.get();
        if (disposed) return;
        const normalized = normalizeWidgetState(stored);
        applySnippets(normalized.snippets);
      } catch (error) {
        if (disposed) return;
        setStatusMessage(errorMessage(error));
      }
    })();

    return () => {
      disposed = true;
      disposeState();
    };
  }, [api, applySnippets]);

  useEffect(() => {
    void refreshTerminalAvailability();
    const timer = window.setInterval(() => {
      void refreshTerminalAvailability();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshTerminalAvailability]);

  const filteredSnippets = useMemo(() => {
    const matched = snippets.filter((entry) => matchSnippet(entry, query, filter, workspaceName));
    return sortSnippets(matched, sort);
  }, [filter, query, snippets, sort, workspaceName]);

  useEffect(() => {
    if (filteredSnippets.length === 0) {
      setSelectedId(null);
      return;
    }

    const selectedStillExists = filteredSnippets.some((entry) => entry.id === selectedId);
    if (!selectedStillExists) {
      setSelectedId(filteredSnippets[0]?.id ?? null);
    }
  }, [filteredSnippets, selectedId]);

  const selectedSnippet = useMemo(
    () => filteredSnippets.find((entry) => entry.id === selectedId) ?? null,
    [filteredSnippets, selectedId]
  );

  const selectedEditorSnippet = useMemo(
    () => snippets.find((entry) => entry.id === editor.snippetId) ?? null,
    [editor.snippetId, snippets]
  );

  const upsertAndPersist = useCallback(
    async (next: CommandSnippet[]) => {
      try {
        await persistSnippets(next);
      } catch (error) {
        setStatusMessage(`保存失败: ${errorMessage(error)}`);
      }
    },
    [persistSnippets]
  );

  const markSnippetUsed = useCallback(
    async (snippetId: string) => {
      const next = snippetsRef.current.map((entry) =>
        entry.id === snippetId ? touchSnippetUsage(entry) : entry
      );
      await upsertAndPersist(next);
    },
    [upsertAndPersist]
  );

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (filteredSnippets.length === 0) return;
      const currentIndex = resolveSnippetIndex(filteredSnippets, selectedId);
      const baseIndex = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex = Math.max(0, Math.min(filteredSnippets.length - 1, baseIndex + direction));
      setSelectedId(filteredSnippets[nextIndex]?.id ?? null);
    },
    [filteredSnippets, selectedId]
  );

  const handleCreate = useCallback(() => {
    setEditor({
      open: true,
      mode: "create",
      snippetId: null
    });
  }, []);

  const handleEdit = useCallback(() => {
    if (!selectedSnippet) return;
    setEditor({
      open: true,
      mode: "edit",
      snippetId: selectedSnippet.id
    });
  }, [selectedSnippet]);

  const handleTogglePin = useCallback(
    (snippetId: string) => {
      const next = snippetsRef.current.map((entry) =>
        entry.id === snippetId
          ? {
              ...entry,
              isPinned: !entry.isPinned,
              updatedAt: new Date().toISOString()
            }
          : entry
      );
      void upsertAndPersist(next);
    },
    [upsertAndPersist]
  );

  const handleDelete = useCallback(() => {
    if (!selectedSnippet) return;
    const confirmDelete = window.confirm(`删除 snippet: ${selectedSnippet.title} ?`);
    if (!confirmDelete) return;

    const next = snippetsRef.current.filter((entry) => entry.id !== selectedSnippet.id);
    void upsertAndPersist(next);
    setStatusMessage("已删除 snippet");
  }, [selectedSnippet, upsertAndPersist]);

  const handleSaveFromModal = useCallback(
    (draft: SnippetDraftInput) => {
      if (editor.mode === "create") {
        const created = createSnippetFromDraft(draft);
        const next = [created, ...snippetsRef.current];
        void upsertAndPersist(next);
        setSelectedId(created.id);
        setStatusMessage("snippet 已创建");
      } else if (selectedEditorSnippet) {
        const next = snippetsRef.current.map((entry) =>
          entry.id === selectedEditorSnippet.id
            ? updateSnippetFromDraft(selectedEditorSnippet, draft)
            : entry
        );
        void upsertAndPersist(next);
        setSelectedId(selectedEditorSnippet.id);
        setStatusMessage("snippet 已更新");
      }

      setEditor({
        open: false,
        mode: "create",
        snippetId: null
      });
    },
    [editor.mode, selectedEditorSnippet, upsertAndPersist]
  );

  const handleCopyContent = useCallback(async () => {
    if (!selectedSnippet) return;
    try {
      await copyTextToClipboard(selectedSnippet.content);
      await markSnippetUsed(selectedSnippet.id);
      setStatusMessage("内容已复制");
    } catch (error) {
      setStatusMessage(`复制失败: ${errorMessage(error)}`);
    }
  }, [markSnippetUsed, selectedSnippet]);

  const handleCopyTitleAndContent = useCallback(async () => {
    if (!selectedSnippet) return;
    try {
      await copyTextToClipboard(formatSnippetTitleAndContent(selectedSnippet));
      await markSnippetUsed(selectedSnippet.id);
      setStatusMessage("标题+内容已复制");
    } catch (error) {
      setStatusMessage(`复制失败: ${errorMessage(error)}`);
    }
  }, [markSnippetUsed, selectedSnippet]);

  const handleInsertTerminal = useCallback(async () => {
    if (!selectedSnippet) return;

    setInsertingTerminal(true);
    try {
      const target = await resolveTerminalTarget();
      if (!target.sessionId) {
        setStatusMessage("当前没有可插入的 terminal");
        setTerminalActionAvailable(false);
        setTerminalHint(target.hint);
        return;
      }

      await api.terminal.write({
        sessionId: target.sessionId,
        data: selectedSnippet.content
      });

      await markSnippetUsed(selectedSnippet.id);
      setStatusMessage(target.fromActive ? "已插入到当前 terminal" : `已插入 terminal（${target.hint}）`);
      setTerminalHint(target.hint);
      setTerminalActionAvailable(true);
    } catch (error) {
      setStatusMessage(`插入终端失败: ${errorMessage(error)}`);
    } finally {
      setInsertingTerminal(false);
      void refreshTerminalAvailability();
    }
  }, [api, markSnippetUsed, refreshTerminalAvailability, resolveTerminalTarget, selectedSnippet]);

  return (
    <WidgetShell className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(120px,1fr)_minmax(220px,44%)]">
      <WidgetHeader>
        <WidgetTitleBlock
          eyebrow="Human Console"
          title="Command Snippets"
          subtitle={`${filteredSnippets.length}/${snippets.length} snippets`}
        />
        <WidgetHeaderActions>
          <span className="widget-chip max-w-[180px] truncate">{workspaceName}</span>
          <button type="button" onClick={handleCreate} className="widget-button widget-button--accent">
            新建
          </button>
        </WidgetHeaderActions>
      </WidgetHeader>

      <WidgetPanel tone="muted">
        <SnippetFilters
          query={query}
          filter={filter}
          sort={sort}
          workspaceName={workspaceName}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onSortChange={setSort}
        />
      </WidgetPanel>

      <WidgetPanel>
        <SnippetList
          snippets={filteredSnippets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onTogglePin={handleTogglePin}
          onMoveSelection={moveSelection}
        />
      </WidgetPanel>

      <WidgetPanel tone="muted">
        <SnippetDetail
          snippet={selectedSnippet}
          terminalActionAvailable={terminalActionAvailable}
          terminalHint={terminalHint}
          insertingTerminal={insertingTerminal}
          onCopyContent={() => {
            void handleCopyContent();
          }}
          onCopyTitleAndContent={() => {
            void handleCopyTitleAndContent();
          }}
          onInsertTerminal={() => {
            void handleInsertTerminal();
          }}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </WidgetPanel>

      <SnippetEditorModal
        open={editor.open}
        mode={editor.mode}
        initialSnippet={selectedEditorSnippet}
        workspaceName={workspaceName}
        onClose={() => {
          setEditor({
            open: false,
            mode: "create",
            snippetId: null
          });
        }}
        onSubmit={handleSaveFromModal}
      />

      <WidgetStatusBar message={statusMessage ?? "录入、搜索、复制、插入终端（不执行）"} />
    </WidgetShell>
  );
}
