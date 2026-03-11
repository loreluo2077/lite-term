import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentConfigAgentKind,
  AgentConfigFile,
  AgentConfigSnapshot,
  ExtensionWidgetInput
} from "@localterm/shared";
import {
  WidgetEmptyState,
  WidgetHeader,
  WidgetHeaderActions,
  WidgetPanel,
  WidgetPanelHeader,
  WidgetShell,
  WidgetStatusBar,
  WidgetTitleBlock,
  cx
} from "@localterm/widget-ui-react";
import { errorMessage, getWidgetApi } from "./widget-api";

type SelectedView = "overview" | "raw";

type WidgetApiContext = {
  tabId: string;
  tabTitle: string;
  isActive: boolean;
  input: ExtensionWidgetInput;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
};

type PersistedState = {
  selectedAgent: AgentConfigAgentKind;
  selectedPath: string | null;
  selectedView: SelectedView;
};

const DEFAULT_STATE: PersistedState = {
  selectedAgent: "codex",
  selectedPath: null,
  selectedView: "overview"
};

function basename(targetPath: string) {
  const normalized = targetPath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? targetPath;
}

function dirname(targetPath: string) {
  const normalized = targetPath.replace(/[\\/]+$/, "");
  const splitAt = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (splitAt <= 0) return normalized;
  return normalized.slice(0, splitAt);
}

function formatReference(file: AgentConfigFile) {
  return `${basename(file.path)} (${file.path})`;
}

function formatScope(scope: AgentConfigFile["scope"]) {
  return scope === "project" ? "Project" : "User";
}

function formatRole(role: AgentConfigFile["role"]) {
  switch (role) {
    case "instructions":
      return "Instructions";
    case "skills":
      return "Skills";
    case "mcp":
      return "MCP";
    case "config":
      return "Config";
    default:
      return "Resource";
  }
}

function normalizeState(raw: Record<string, unknown> | null | undefined): PersistedState {
  const source = raw ?? {};
  return {
    selectedAgent: source.selectedAgent === "claude_code" ? "claude_code" : "codex",
    selectedPath: typeof source.selectedPath === "string" ? source.selectedPath : null,
    selectedView: source.selectedView === "raw" ? "raw" : "overview"
  };
}

function pickFile(snapshot: AgentConfigSnapshot | null, preferredPath?: string | null) {
  if (!snapshot) return null;
  if (preferredPath) {
    const matched = snapshot.files.find((entry) => entry.path === preferredPath);
    if (matched) return matched;
  }
  return (
    snapshot.files.find((entry) => entry.exists && entry.entryType === "file") ??
    snapshot.files.find((entry) => entry.entryType === "file") ??
    snapshot.files[0] ??
    null
  );
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function App() {
  const api = getWidgetApi();
  const [context, setContext] = useState<WidgetApiContext | null>(null);
  const [snapshots, setSnapshots] = useState<AgentConfigSnapshot[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfigAgentKind>(DEFAULT_STATE.selectedAgent);
  const [selectedPath, setSelectedPath] = useState<string | null>(DEFAULT_STATE.selectedPath);
  const [selectedView, setSelectedView] = useState<SelectedView>(DEFAULT_STATE.selectedView);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isBootedRef = useRef(false);
  const workspaceRootRef = useRef<string | null>(null);

  const selectedSnapshot = useMemo(
    () => snapshots.find((entry) => entry.agent === selectedAgent) ?? snapshots[0] ?? null,
    [selectedAgent, snapshots]
  );

  const selectedFile = useMemo(
    () => selectedSnapshot?.files.find((entry) => entry.path === selectedPath) ?? pickFile(selectedSnapshot, selectedPath),
    [selectedPath, selectedSnapshot]
  );

  const loadFileContent = useCallback(
    async (file: AgentConfigFile | null) => {
      if (!file || file.entryType !== "file") {
        setContent("");
        setDirty(false);
        return;
      }
      setContentLoading(true);
      try {
        const response = await api.agentConfigs.readFile({ path: file.path });
        setContent(response.content);
        setDirty(false);
        if (response.truncated) {
          setStatusMessage("File truncated at 1 MB.");
        }
      } catch (error) {
        setStatusMessage(errorMessage(error));
        setContent("");
        setDirty(false);
      } finally {
        setContentLoading(false);
      }
    },
    [api]
  );

  const refreshSnapshots = useCallback(
    async (preferred?: Partial<PersistedState>, workspaceRootPath?: string | null) => {
      const response = await api.agentConfigs.list({
        workspaceRootPath: workspaceRootPath ?? workspaceRootRef.current ?? null
      });
      const nextSnapshots = response.snapshots;
      const nextAgent =
        preferred?.selectedAgent && nextSnapshots.some((entry) => entry.agent === preferred.selectedAgent)
          ? preferred.selectedAgent
          : nextSnapshots[0]?.agent ?? "codex";
      const nextSnapshot = nextSnapshots.find((entry) => entry.agent === nextAgent) ?? nextSnapshots[0] ?? null;
      const nextFile = pickFile(nextSnapshot, preferred?.selectedPath ?? null);

      setSnapshots(nextSnapshots);
      setSelectedAgent(nextAgent);
      setSelectedPath(nextFile?.path ?? null);
      await loadFileContent(nextFile);
      return {
        nextAgent,
        nextPath: nextFile?.path ?? null
      };
    },
    [api, loadFileContent]
  );

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const [nextContext, rawState] = await Promise.all([
          api.widget.getContext(),
          api.state.get()
        ]);
        if (disposed) return;
        setContext(nextContext as WidgetApiContext);
        workspaceRootRef.current = nextContext.workspaceRootPath;
        void api.widget.setTitle("Agent Configs").catch(() => undefined);
        const normalized = normalizeState(rawState);
        setSelectedView(normalized.selectedView);
        const result = await refreshSnapshots(normalized, nextContext.workspaceRootPath);
        if (disposed) return;
        setSelectedAgent(result.nextAgent);
        setSelectedPath(result.nextPath);
        isBootedRef.current = true;
      } catch (error) {
        if (!disposed) {
          setStatusMessage(errorMessage(error));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [api, refreshSnapshots]);

  useEffect(() => {
    if (!isBootedRef.current) return;
    void api.state.patch({
      selectedAgent,
      selectedPath,
      selectedView
    }).catch(() => undefined);
  }, [api, selectedAgent, selectedPath, selectedView]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const handleAgentSelect = useCallback(
    async (agent: AgentConfigAgentKind) => {
      const nextSnapshot = snapshots.find((entry) => entry.agent === agent) ?? null;
      const nextFile = pickFile(nextSnapshot, null);
      setSelectedAgent(agent);
      setSelectedPath(nextFile?.path ?? null);
      await loadFileContent(nextFile);
    },
    [loadFileContent, snapshots]
  );

  const handleFileSelect = useCallback(
    async (file: AgentConfigFile) => {
      setSelectedPath(file.path);
      await loadFileContent(file);
    },
    [loadFileContent]
  );

  const handleReload = useCallback(async () => {
    try {
      await refreshSnapshots({ selectedAgent, selectedPath, selectedView });
      setStatusMessage("Config snapshot reloaded.");
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, [refreshSnapshots, selectedAgent, selectedPath, selectedView]);

  const handleCopyPath = useCallback(async () => {
    if (!selectedFile) return;
    await copyText(selectedFile.path);
    setStatusMessage("Path copied.");
  }, [selectedFile]);

  const handleCopyReference = useCallback(async () => {
    if (!selectedFile) return;
    await copyText(formatReference(selectedFile));
    setStatusMessage("Reference copied.");
  }, [selectedFile]);

  const handleReveal = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await api.agentConfigs.revealPath({ path: selectedFile.path });
      setStatusMessage("Revealed in Finder.");
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, [api, selectedFile]);

  const handleOpenInFiles = useCallback(async () => {
    if (!selectedFile) return;
    const targetDirectory = selectedFile.entryType === "directory" ? selectedFile.path : dirname(selectedFile.path);
    const workspaceRootPath = context?.workspaceRootPath?.trim() || "";
    const rootPath =
      workspaceRootPath && targetDirectory.startsWith(workspaceRootPath)
        ? workspaceRootPath
        : targetDirectory;
    try {
      await api.widget.openWidget({
        widgetId: "file.browser",
        title: basename(selectedFile.path),
        state: {
          rootPath,
          currentPath: targetDirectory,
          selectedPath: selectedFile.entryType === "file" ? selectedFile.path : null,
          showHidden: true
        }
      });
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, [api, context?.workspaceRootPath, selectedFile]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || selectedFile.entryType !== "file" || !selectedFile.editable) return;
    setSaving(true);
    try {
      await api.agentConfigs.writeFile({ path: selectedFile.path, content });
      setDirty(false);
      await refreshSnapshots({ selectedAgent, selectedPath, selectedView });
      setStatusMessage(`Saved ${basename(selectedFile.path)}.`);
    } catch (error) {
      setStatusMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [api, content, refreshSnapshots, selectedAgent, selectedFile, selectedPath, selectedView]);

  const statusText = statusMessage ?? `${snapshots.length} agents · ${selectedSnapshot?.files.length ?? 0} entries`;

  return (
    <WidgetShell className="agent-configs-shell">
      <WidgetHeader>
        <WidgetTitleBlock
          eyebrow="Agent Configs"
          title={selectedSnapshot?.title ?? "Agent Configs"}
          subtitle={context?.workspaceRootPath || "Inspect project and user config, instructions, skills, and MCP references."}
        />
        <WidgetHeaderActions>
          <button type="button" className="agent-configs-button" onClick={() => void handleCopyPath()} disabled={!selectedFile}>
            Copy Path
          </button>
          <button type="button" className="agent-configs-button" onClick={() => void handleCopyReference()} disabled={!selectedFile}>
            Copy Name + Path
          </button>
          <button type="button" className="agent-configs-button" onClick={() => void handleOpenInFiles()} disabled={!selectedFile}>
            Open In Files
          </button>
          <button type="button" className="agent-configs-button" onClick={() => void handleReveal()} disabled={!selectedFile}>
            Reveal
          </button>
          <button type="button" className="agent-configs-button" onClick={() => void handleReload()}>
            Reload
          </button>
        </WidgetHeaderActions>
      </WidgetHeader>

      <div className="agent-configs-grid">
        <WidgetPanel className="agent-configs-panel">
          <WidgetPanelHeader>
            <div>
              <div className="agent-configs-panel-title">Agents</div>
              <div className="agent-configs-panel-subtitle">Detected config surfaces</div>
            </div>
          </WidgetPanelHeader>
          <div className="agent-configs-list">
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.agent}
                type="button"
                className={cx("agent-configs-agent-card", snapshot.agent === selectedAgent && "is-active")}
                onClick={() => void handleAgentSelect(snapshot.agent)}
              >
                <div className="agent-configs-agent-card__top">
                  <span className="agent-configs-agent-card__title">{snapshot.title}</span>
                  <span className="agent-configs-pill">{snapshot.files.length}</span>
                </div>
                <div className="agent-configs-agent-card__meta">{snapshot.description}</div>
              </button>
            ))}
            {snapshots.length === 0 ? (
              <WidgetEmptyState
                title="No agent configs"
                description="Agent config snapshots will appear here after discovery completes."
              />
            ) : null}
          </div>
        </WidgetPanel>

        <WidgetPanel className="agent-configs-panel">
          <WidgetPanelHeader>
            <div>
              <div className="agent-configs-panel-title">Entries</div>
              <div className="agent-configs-panel-subtitle">Project and user files, plus skills folders</div>
            </div>
          </WidgetPanelHeader>
          <div className="agent-configs-list">
            {selectedSnapshot?.files.map((file) => (
              <button
                key={file.path}
                type="button"
                className={cx("agent-configs-file-card", selectedFile?.path === file.path && "is-active")}
                onClick={() => void handleFileSelect(file)}
              >
                <div className="agent-configs-file-card__top">
                  <span className="agent-configs-file-card__title">{basename(file.path)}</span>
                  <span className={cx("agent-configs-badge", !file.exists && "is-missing")}>{file.exists ? "Present" : "Missing"}</span>
                </div>
                <div className="agent-configs-file-card__meta">
                  <span className="agent-configs-pill">{formatScope(file.scope)}</span>
                  <span className="agent-configs-pill">{formatRole(file.role)}</span>
                  <span className="agent-configs-pill">{file.format}</span>
                </div>
                <div className="agent-configs-file-card__path">{file.path}</div>
                {file.summary ? <div className="agent-configs-file-card__summary">{file.summary}</div> : null}
              </button>
            ))}
            {!selectedSnapshot ? (
              <WidgetEmptyState
                title="No entries"
                description="Select an agent to inspect its config files and folders."
              />
            ) : null}
          </div>
        </WidgetPanel>

        <WidgetPanel className="agent-configs-panel agent-configs-panel--detail">
          <WidgetPanelHeader className="agent-configs-detail-header">
            <div>
              <div className="agent-configs-panel-title">{selectedFile ? basename(selectedFile.path) : "Details"}</div>
              <div className="agent-configs-panel-subtitle">{selectedFile?.path ?? "Select an entry to inspect or edit."}</div>
            </div>
            <div className="agent-configs-tabs">
              <button
                type="button"
                className={cx("agent-configs-tab", selectedView === "overview" && "is-active")}
                onClick={() => setSelectedView("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={cx("agent-configs-tab", selectedView === "raw" && "is-active")}
                onClick={() => setSelectedView("raw")}
                disabled={!selectedFile || selectedFile.entryType !== "file"}
              >
                Raw
              </button>
            </div>
          </WidgetPanelHeader>

          {!selectedSnapshot || !selectedFile ? (
            <WidgetEmptyState
              title="Nothing selected"
              description="Pick an agent entry to inspect config details or edit raw content."
            />
          ) : selectedView === "overview" ? (
            <div className="agent-configs-overview">
              <section className="agent-configs-section">
                <div className="agent-configs-section__title">Selected Entry</div>
                <div className="agent-configs-metadata-grid">
                  <div>
                    <div className="agent-configs-metadata-label">Scope</div>
                    <div className="agent-configs-metadata-value">{formatScope(selectedFile.scope)}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Role</div>
                    <div className="agent-configs-metadata-value">{formatRole(selectedFile.role)}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Editable</div>
                    <div className="agent-configs-metadata-value">{selectedFile.editable ? "Yes" : "No"}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Exists</div>
                    <div className="agent-configs-metadata-value">{selectedFile.exists ? "Yes" : "No"}</div>
                  </div>
                </div>
              </section>

              <section className="agent-configs-section">
                <div className="agent-configs-section__title">Resolved Settings</div>
                <div className="agent-configs-metadata-grid">
                  <div>
                    <div className="agent-configs-metadata-label">Model</div>
                    <div className="agent-configs-metadata-value">{selectedSnapshot.resolved.model || "Not detected"}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Provider</div>
                    <div className="agent-configs-metadata-value">{selectedSnapshot.resolved.provider || "Not detected"}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Base URL</div>
                    <div className="agent-configs-metadata-value">{selectedSnapshot.resolved.apiBaseUrl || "Not detected"}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Approval</div>
                    <div className="agent-configs-metadata-value">{selectedSnapshot.resolved.approvalMode || "Not detected"}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Sandbox</div>
                    <div className="agent-configs-metadata-value">{selectedSnapshot.resolved.sandboxMode || "Not detected"}</div>
                  </div>
                  <div>
                    <div className="agent-configs-metadata-label">Skills Path</div>
                    <div className="agent-configs-metadata-value">{selectedSnapshot.resolved.skillsPath || "Not detected"}</div>
                  </div>
                </div>
                <div className="agent-configs-mcp-block">
                  <div className="agent-configs-metadata-label">MCP Servers</div>
                  {selectedSnapshot.resolved.mcpServers.length > 0 ? (
                    <div className="agent-configs-chip-row">
                      {selectedSnapshot.resolved.mcpServers.map((server) => (
                        <span key={server} className="agent-configs-pill">{server}</span>
                      ))}
                    </div>
                  ) : (
                    <div className="agent-configs-metadata-value">No MCP server detected.</div>
                  )}
                </div>
              </section>
            </div>
          ) : selectedFile.entryType !== "file" ? (
            <WidgetEmptyState
              title="Directory reference"
              description="This entry is a directory. Use path copy, reveal, or open it in Files."
            />
          ) : (
            <div className="agent-configs-editor-shell">
              {contentLoading ? <div className="agent-configs-loading">Loading content…</div> : null}
              <textarea
                className="agent-configs-editor"
                spellCheck={false}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setDirty(true);
                }}
                placeholder={selectedFile.exists ? "" : "File does not exist yet. Save to create it."}
              />
              <div className="agent-configs-editor-actions">
                <button
                  type="button"
                  className="agent-configs-button"
                  onClick={() => void handleSave()}
                  disabled={!selectedFile.editable || saving || (!dirty && selectedFile.exists)}
                >
                  {saving ? "Saving…" : selectedFile.exists ? "Save" : "Create File"}
                </button>
                <span className="agent-configs-editor-hint">
                  {dirty ? "Unsaved changes" : selectedFile.editable ? "Ready to edit" : "Read only"}
                </span>
              </div>
            </div>
          )}
        </WidgetPanel>
      </div>

      <WidgetStatusBar message={loading ? "Loading agent configs…" : statusText} />
    </WidgetShell>
  );
}
