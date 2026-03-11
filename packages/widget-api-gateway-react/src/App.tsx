import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApiGatewayCheckProviderHealthResponse,
  ApiGatewayConfig,
  ApiGatewayModelAlias,
  ApiGatewayModelAliasInput,
  ApiGatewayProviderInput,
  ApiGatewayProviderSummary,
  ApiGatewaySettings,
  ApiGatewayStatus
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

type ProviderDraft = ApiGatewayProviderSummary & {
  apiKey?: string | null;
  clearApiKey?: boolean;
};

type AliasDraft = ApiGatewayModelAlias;

type ProviderEditorState = {
  open: boolean;
  mode: "create" | "edit";
  providerId: string | null;
  name: string;
  baseUrl: string;
  apiKeyInput: string;
  clearApiKey: boolean;
  enabled: boolean;
  isDefault: boolean;
  headersText: string;
};

type AliasEditorState = {
  open: boolean;
  mode: "create" | "edit";
  aliasId: string | null;
  alias: string;
  providerId: string;
  upstreamModel: string;
  enabled: boolean;
};

type GatewayDraftConfig = {
  providers: ProviderDraft[];
  aliases: AliasDraft[];
  settings: ApiGatewaySettings;
};

const DEFAULT_CONFIG: GatewayDraftConfig = {
  providers: [],
  aliases: [],
  settings: {
    listenHost: "127.0.0.1",
    listenPort: 4310,
    requestTimeoutMs: 60000,
    autoStart: false,
    defaultProviderId: null,
    defaultModelAlias: null
  }
};

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneConfig(config: ApiGatewayConfig): GatewayDraftConfig {
  return {
    providers: config.providers.map((entry) => ({ ...entry })),
    aliases: config.aliases.map((entry) => ({ ...entry })),
    settings: { ...config.settings }
  };
}

function toSavePayload(config: GatewayDraftConfig) {
  return {
    providers: config.providers.map<ApiGatewayProviderInput>((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      baseUrl: entry.baseUrl,
      headers: entry.headers,
      enabled: entry.enabled,
      isDefault: entry.id === config.settings.defaultProviderId,
      ...(typeof entry.apiKey === "string" ? { apiKey: entry.apiKey } : {}),
      ...(entry.clearApiKey === true ? { clearApiKey: true } : {}),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      health: entry.health,
      lastCheckedAt: entry.lastCheckedAt
    })),
    aliases: config.aliases.map<ApiGatewayModelAliasInput>((entry) => ({
      id: entry.id,
      alias: entry.alias,
      providerId: entry.providerId,
      upstreamModel: entry.upstreamModel,
      enabled: entry.enabled,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })),
    settings: config.settings
  };
}

function openProviderEditor(provider?: ProviderDraft): ProviderEditorState {
  return {
    open: true,
    mode: provider ? "edit" : "create",
    providerId: provider?.id ?? null,
    name: provider?.name ?? "",
    baseUrl: provider?.baseUrl ?? "",
    apiKeyInput: "",
    clearApiKey: false,
    enabled: provider?.enabled ?? true,
    isDefault: provider?.isDefault ?? false,
    headersText: JSON.stringify(provider?.headers ?? {}, null, 2)
  };
}

function openAliasEditor(alias?: AliasDraft, fallbackProviderId?: string | null): AliasEditorState {
  return {
    open: true,
    mode: alias ? "edit" : "create",
    aliasId: alias?.id ?? null,
    alias: alias?.alias ?? "",
    providerId: alias?.providerId ?? fallbackProviderId ?? "",
    upstreamModel: alias?.upstreamModel ?? "",
    enabled: alias?.enabled ?? true
  };
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function App() {
  const api = getWidgetApi();
  const [config, setConfig] = useState<GatewayDraftConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ApiGatewayStatus | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerEditor, setProviderEditor] = useState<ProviderEditorState>({
    open: false,
    mode: "create",
    providerId: null,
    name: "",
    baseUrl: "",
    apiKeyInput: "",
    clearApiKey: false,
    enabled: true,
    isDefault: false,
    headersText: "{}"
  });
  const [aliasEditor, setAliasEditor] = useState<AliasEditorState>({
    open: false,
    mode: "create",
    aliasId: null,
    alias: "",
    providerId: "",
    upstreamModel: "",
    enabled: true
  });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedProvider = useMemo(
    () => config.providers.find((entry) => entry.id === selectedProviderId) ?? null,
    [config.providers, selectedProviderId]
  );

  const refresh = useCallback(async () => {
    const [nextConfig, nextStatus] = await Promise.all([api.gateway.getConfig(), api.gateway.getStatus()]);
    setConfig(cloneConfig(nextConfig));
    setStatus(nextStatus);
    setSelectedProviderId((current) => current ?? nextConfig.providers[0]?.id ?? null);
    setDirty(false);
    void api.widget.setTitle(`API Gateway (${nextStatus.running ? "Running" : "Stopped"})`).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await api.widget.getContext();
        if (!cancelled) {
          void api.widget.setTitle("API Gateway").catch(() => undefined);
        }
        if (context && !cancelled) {
          await refresh();
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(errorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, refresh]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const updateSettings = useCallback((patch: Partial<ApiGatewaySettings>) => {
    setConfig((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch
      }
    }));
    setDirty(true);
  }, []);

  const saveConfig = useCallback(async () => {
    setBusy(true);
    try {
      const saved = await api.gateway.saveConfig(toSavePayload(config));
      setConfig(cloneConfig(saved));
      setSelectedProviderId((current) => current ?? saved.providers[0]?.id ?? null);
      setDirty(false);
      setStatusMessage("配置已保存");
      setStatus(await api.gateway.getStatus());
    } catch (error) {
      setStatusMessage(`保存失败: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }, [api, config]);

  const handleStartStop = useCallback(async () => {
    setBusy(true);
    try {
      const nextStatus = status?.running ? await api.gateway.stop() : await api.gateway.start();
      setStatus(nextStatus);
      setStatusMessage(nextStatus.running ? "Gateway 已启动" : "Gateway 已停止");
      void api.widget.setTitle(`API Gateway (${nextStatus.running ? "Running" : "Stopped"})`).catch(() => undefined);
    } catch (error) {
      setStatusMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [api, status?.running]);

  const checkProviderHealth = useCallback(
    async (providerId: string) => {
      setBusy(true);
      try {
        const result = await api.gateway.checkProviderHealth({ providerId });
        setConfig((current) => ({
          ...current,
          providers: current.providers.map((entry) =>
            entry.id === providerId
              ? {
                  ...entry,
                  health: result.ok ? "ok" : "error",
                  lastCheckedAt: result.checkedAt
                }
              : entry
          )
        }));
        setStatusMessage(result.message);
      } catch (error) {
        setStatusMessage(`健康检查失败: ${errorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [api]
  );

  const saveProviderDraft = useCallback(() => {
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(providerEditor.headersText || "{}");
    } catch {
      setStatusMessage("Headers 必须是有效 JSON");
      return;
    }

    const name = providerEditor.name.trim();
    const baseUrl = providerEditor.baseUrl.trim();
    if (!name || !baseUrl) {
      setStatusMessage("Provider name 和 Base URL 必填");
      return;
    }

    const nextId = providerEditor.providerId ?? makeId("provider");
    setConfig((current) => {
      const nextProvider: ProviderDraft = {
        ...(current.providers.find((entry) => entry.id === nextId) ?? {
          id: nextId,
          type: "openai_compatible" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          health: "unknown" as const,
          lastCheckedAt: null,
          hasApiKey: false,
          apiKeyPreview: null
        }),
        id: nextId,
        name,
        baseUrl,
        headers: parsedHeaders,
        enabled: providerEditor.enabled,
        isDefault: providerEditor.isDefault,
        ...(providerEditor.apiKeyInput.trim()
          ? { apiKey: providerEditor.apiKeyInput.trim() }
          : {}),
        ...(providerEditor.clearApiKey ? { clearApiKey: true, apiKey: null } : {})
      };

      const providers = current.providers.some((entry) => entry.id === nextId)
        ? current.providers.map((entry) => (entry.id === nextId ? nextProvider : { ...entry, isDefault: providerEditor.isDefault ? false : entry.isDefault }))
        : [
            ...current.providers.map((entry) => ({
              ...entry,
              isDefault: providerEditor.isDefault ? false : entry.isDefault
            })),
            nextProvider
          ];

      return {
        ...current,
        providers,
        settings: {
          ...current.settings,
          defaultProviderId: providerEditor.isDefault
            ? nextId
            : current.settings.defaultProviderId ?? nextId
        }
      };
    });
    setSelectedProviderId(nextId);
    setProviderEditor((current) => ({ ...current, open: false }));
    setDirty(true);
  }, [providerEditor]);

  const removeProvider = useCallback((providerId: string) => {
    setConfig((current) => {
      const nextProviders = current.providers.filter((entry) => entry.id !== providerId);
      const nextAliases = current.aliases.filter((entry) => entry.providerId !== providerId);
      const nextDefaultProviderId =
        current.settings.defaultProviderId === providerId ? nextProviders[0]?.id ?? null : current.settings.defaultProviderId;
      const nextDefaultModelAlias =
        current.settings.defaultModelAlias &&
        nextAliases.some((entry) => entry.alias === current.settings.defaultModelAlias)
          ? current.settings.defaultModelAlias
          : null;
      return {
        providers: nextProviders,
        aliases: nextAliases,
        settings: {
          ...current.settings,
          defaultProviderId: nextDefaultProviderId,
          defaultModelAlias: nextDefaultModelAlias
        }
      };
    });
    setSelectedProviderId((current) => (current === providerId ? null : current));
    setDirty(true);
  }, []);

  const saveAliasDraft = useCallback(() => {
    const alias = aliasEditor.alias.trim();
    const upstreamModel = aliasEditor.upstreamModel.trim();
    if (!alias || !upstreamModel || !aliasEditor.providerId) {
      setStatusMessage("Alias、Provider、Upstream model 必填");
      return;
    }

    const nextId = aliasEditor.aliasId ?? makeId("alias");
    setConfig((current) => {
      const existing = current.aliases.find((entry) => entry.id === nextId);
      const nextAlias: AliasDraft = {
        id: nextId,
        alias,
        providerId: aliasEditor.providerId,
        upstreamModel,
        enabled: aliasEditor.enabled,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const aliases = current.aliases.some((entry) => entry.id === nextId)
        ? current.aliases.map((entry) => (entry.id === nextId ? nextAlias : entry))
        : [...current.aliases, nextAlias];
      return {
        ...current,
        aliases,
        settings: {
          ...current.settings,
          defaultModelAlias: current.settings.defaultModelAlias ?? alias
        }
      };
    });
    setAliasEditor((current) => ({ ...current, open: false }));
    setDirty(true);
  }, [aliasEditor]);

  const visibleAliases = useMemo(() => {
    return [...config.aliases].sort((left, right) => left.alias.localeCompare(right.alias, "zh-CN"));
  }, [config.aliases]);

  if (loading) {
    return (
      <WidgetShell>
        <WidgetPanel>
          <WidgetEmptyState title="Loading API Gateway" description="正在读取本地 gateway 配置。" />
        </WidgetPanel>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell className="gateway-widget">
      <WidgetHeader>
        <WidgetTitleBlock
          eyebrow="Gateway"
          title="API Gateway"
          subtitle={status ? `${status.baseUrl} · ${status.running ? "Running" : "Stopped"}` : "读取运行状态中"}
        />
        <WidgetHeaderActions>
          <button className="widget-button widget-button--ghost" type="button" onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
          <button
            className="widget-button"
            type="button"
            onClick={() => void copyToClipboard(status?.baseUrl ?? `http://${config.settings.listenHost}:${config.settings.listenPort}`).then(() => setStatusMessage("Base URL 已复制")).catch((error) => setStatusMessage(errorMessage(error)))}
          >
            Copy Base URL
          </button>
          <button className="widget-button widget-button--accent" type="button" onClick={() => void handleStartStop()} disabled={busy}>
            {status?.running ? "Stop" : "Start"}
          </button>
        </WidgetHeaderActions>
      </WidgetHeader>

      <WidgetPanel className="gateway-panel">
        <WidgetPanelHeader>
          <span>Providers</span>
          <div className="gateway-panel-actions">
            <button className="widget-button widget-button--ghost" type="button" onClick={() => setProviderEditor(openProviderEditor())}>
              New Provider
            </button>
          </div>
        </WidgetPanelHeader>
        <div className="gateway-providers">
          <div className="gateway-provider-list">
            {config.providers.length === 0 ? (
              <div className="gateway-empty-box">No providers configured.</div>
            ) : (
              config.providers.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={cx("gateway-provider-item", selectedProviderId === entry.id && "is-active")}
                  onClick={() => setSelectedProviderId(entry.id)}
                >
                  <div className="gateway-provider-item__top">
                    <strong>{entry.name}</strong>
                    <span className={`gateway-health gateway-health--${entry.health}`}>{entry.health}</span>
                  </div>
                  <div className="gateway-provider-item__meta">
                    <span>{entry.baseUrl}</span>
                    {entry.isDefault || config.settings.defaultProviderId === entry.id ? <span className="widget-chip">Default</span> : null}
                    {entry.hasApiKey ? <span className="widget-chip">{entry.apiKeyPreview}</span> : <span className="widget-chip">No key</span>}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="gateway-provider-detail">
            {selectedProvider ? (
              <>
                <div className="gateway-provider-detail__header">
                  <div>
                    <div className="gateway-provider-detail__title">{selectedProvider.name}</div>
                    <div className="gateway-provider-detail__subtitle">{selectedProvider.baseUrl}</div>
                  </div>
                  <div className="gateway-provider-detail__actions">
                    <button className="widget-button widget-button--ghost" type="button" onClick={() => void checkProviderHealth(selectedProvider.id)} disabled={busy}>
                      Check Health
                    </button>
                    <button className="widget-button widget-button--ghost" type="button" onClick={() => setProviderEditor(openProviderEditor(selectedProvider))}>
                      Edit
                    </button>
                    <button className="widget-button widget-button--danger" type="button" onClick={() => removeProvider(selectedProvider.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <div className="gateway-provider-grid">
                  <div>
                    <div className="gateway-field-label">Type</div>
                    <div className="gateway-field-value">{selectedProvider.type}</div>
                  </div>
                  <div>
                    <div className="gateway-field-label">Headers</div>
                    <div className="gateway-field-value widget-code">{Object.keys(selectedProvider.headers).length}</div>
                  </div>
                  <div>
                    <div className="gateway-field-label">Last Checked</div>
                    <div className="gateway-field-value">{selectedProvider.lastCheckedAt ?? "Never"}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="gateway-empty-box">Select a provider to inspect it.</div>
            )}
          </div>
        </div>
      </WidgetPanel>

      <WidgetPanel className="gateway-panel">
        <WidgetPanelHeader>
          <span>Model Aliases</span>
          <button className="widget-button widget-button--ghost" type="button" onClick={() => setAliasEditor(openAliasEditor(undefined, selectedProviderId))}>
            New Alias
          </button>
        </WidgetPanelHeader>
        <div className="gateway-alias-list">
          {visibleAliases.length === 0 ? (
            <div className="gateway-empty-box">No aliases configured.</div>
          ) : (
            visibleAliases.map((entry) => (
              <div key={entry.id} className="gateway-alias-item">
                <div>
                  <div className="gateway-alias-item__title">{entry.alias}</div>
                  <div className="gateway-alias-item__subtitle">{entry.providerId} → {entry.upstreamModel}</div>
                </div>
                <div className="gateway-alias-item__actions">
                  {config.settings.defaultModelAlias === entry.alias ? <span className="widget-chip">Default</span> : null}
                  <button className="widget-button widget-button--ghost" type="button" onClick={() => setAliasEditor(openAliasEditor(entry))}>
                    Edit
                  </button>
                  <button
                    className="widget-button widget-button--danger"
                    type="button"
                    onClick={() => {
                      setConfig((current) => ({
                        ...current,
                        aliases: current.aliases.filter((aliasItem) => aliasItem.id !== entry.id),
                        settings: {
                          ...current.settings,
                          defaultModelAlias:
                            current.settings.defaultModelAlias === entry.alias ? null : current.settings.defaultModelAlias
                        }
                      }));
                      setDirty(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </WidgetPanel>

      <WidgetPanel className="gateway-panel">
        <WidgetPanelHeader>
          <span>Settings</span>
          <button className="widget-button widget-button--accent" type="button" onClick={() => void saveConfig()} disabled={busy || !dirty}>
            Save Changes
          </button>
        </WidgetPanelHeader>
        <div className="gateway-settings-grid">
          <label>
            <span className="gateway-field-label">Listen Host</span>
            <input className="widget-input" value={config.settings.listenHost} onChange={(event) => updateSettings({ listenHost: event.target.value })} />
          </label>
          <label>
            <span className="gateway-field-label">Listen Port</span>
            <input className="widget-input" type="number" value={config.settings.listenPort} onChange={(event) => updateSettings({ listenPort: Math.max(1, Number(event.target.value) || 4310) })} />
          </label>
          <label>
            <span className="gateway-field-label">Request Timeout (ms)</span>
            <input className="widget-input" type="number" value={config.settings.requestTimeoutMs} onChange={(event) => updateSettings({ requestTimeoutMs: Math.max(1000, Number(event.target.value) || 60000) })} />
          </label>
          <label>
            <span className="gateway-field-label">Default Provider</span>
            <select className="widget-select" value={config.settings.defaultProviderId ?? ""} onChange={(event) => updateSettings({ defaultProviderId: event.target.value || null })}>
              <option value="">Select provider</option>
              {config.providers.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="gateway-field-label">Default Alias</span>
            <select className="widget-select" value={config.settings.defaultModelAlias ?? ""} onChange={(event) => updateSettings({ defaultModelAlias: event.target.value || null })}>
              <option value="">None</option>
              {config.aliases.map((entry) => (
                <option key={entry.id} value={entry.alias}>{entry.alias}</option>
              ))}
            </select>
          </label>
          <label className="gateway-checkbox-row">
            <input type="checkbox" checked={config.settings.autoStart} onChange={(event) => updateSettings({ autoStart: event.target.checked })} />
            <span>Auto-start on app launch</span>
          </label>
        </div>
      </WidgetPanel>

      <WidgetPanel className="gateway-panel gateway-panel--status" tone="muted">
        <WidgetPanelHeader>
          <span>Status</span>
        </WidgetPanelHeader>
        {status ? (
          <div className="gateway-status-grid">
            <div>
              <div className="gateway-field-label">Base URL</div>
              <div className="gateway-field-value widget-code">{status.baseUrl}</div>
            </div>
            <div>
              <div className="gateway-field-label">Running</div>
              <div className="gateway-field-value">{status.running ? "Yes" : "No"}</div>
            </div>
            <div>
              <div className="gateway-field-label">Providers</div>
              <div className="gateway-field-value">{status.providerCount}</div>
            </div>
            <div>
              <div className="gateway-field-label">Aliases</div>
              <div className="gateway-field-value">{status.aliasCount}</div>
            </div>
            <div>
              <div className="gateway-field-label">Started At</div>
              <div className="gateway-field-value">{status.startedAt ?? "-"}</div>
            </div>
            <div>
              <div className="gateway-field-label">Last Error</div>
              <div className="gateway-field-value">{status.lastError ?? "-"}</div>
            </div>
          </div>
        ) : (
          <WidgetEmptyState title="No status" description="Gateway runtime status unavailable." />
        )}
      </WidgetPanel>

      {providerEditor.open ? (
        <div className="gateway-modal-backdrop" role="presentation">
          <div className="gateway-modal">
            <div className="gateway-modal__header">
              <h2>{providerEditor.mode === "create" ? "New Provider" : "Edit Provider"}</h2>
              <button className="widget-button widget-button--ghost" type="button" onClick={() => setProviderEditor((current) => ({ ...current, open: false }))}>Close</button>
            </div>
            <div className="gateway-modal__body">
              <label>
                <span className="gateway-field-label">Name</span>
                <input className="widget-input" value={providerEditor.name} onChange={(event) => setProviderEditor((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span className="gateway-field-label">Base URL</span>
                <input className="widget-input" placeholder="https://host.example/v1" value={providerEditor.baseUrl} onChange={(event) => setProviderEditor((current) => ({ ...current, baseUrl: event.target.value }))} />
              </label>
              <label>
                <span className="gateway-field-label">API Key</span>
                <input className="widget-input widget-code" type="password" placeholder={providerEditor.mode === "edit" ? "Leave empty to keep saved key" : "sk-..."} value={providerEditor.apiKeyInput} onChange={(event) => setProviderEditor((current) => ({ ...current, apiKeyInput: event.target.value, clearApiKey: false }))} />
              </label>
              <label className="gateway-checkbox-row">
                <input type="checkbox" checked={providerEditor.clearApiKey} onChange={(event) => setProviderEditor((current) => ({ ...current, clearApiKey: event.target.checked, apiKeyInput: event.target.checked ? "" : current.apiKeyInput }))} />
                <span>Clear saved API key</span>
              </label>
              <label>
                <span className="gateway-field-label">Headers (JSON)</span>
                <textarea className="widget-textarea widget-code" value={providerEditor.headersText} onChange={(event) => setProviderEditor((current) => ({ ...current, headersText: event.target.value }))} />
              </label>
              <label className="gateway-checkbox-row">
                <input type="checkbox" checked={providerEditor.enabled} onChange={(event) => setProviderEditor((current) => ({ ...current, enabled: event.target.checked }))} />
                <span>Enabled</span>
              </label>
              <label className="gateway-checkbox-row">
                <input type="checkbox" checked={providerEditor.isDefault} onChange={(event) => setProviderEditor((current) => ({ ...current, isDefault: event.target.checked }))} />
                <span>Use as default provider</span>
              </label>
            </div>
            <div className="gateway-modal__footer">
              <button className="widget-button" type="button" onClick={() => saveProviderDraft()}>
                Save Provider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {aliasEditor.open ? (
        <div className="gateway-modal-backdrop" role="presentation">
          <div className="gateway-modal">
            <div className="gateway-modal__header">
              <h2>{aliasEditor.mode === "create" ? "New Alias" : "Edit Alias"}</h2>
              <button className="widget-button widget-button--ghost" type="button" onClick={() => setAliasEditor((current) => ({ ...current, open: false }))}>Close</button>
            </div>
            <div className="gateway-modal__body">
              <label>
                <span className="gateway-field-label">Alias</span>
                <input className="widget-input" value={aliasEditor.alias} onChange={(event) => setAliasEditor((current) => ({ ...current, alias: event.target.value }))} />
              </label>
              <label>
                <span className="gateway-field-label">Provider</span>
                <select className="widget-select" value={aliasEditor.providerId} onChange={(event) => setAliasEditor((current) => ({ ...current, providerId: event.target.value }))}>
                  <option value="">Select provider</option>
                  {config.providers.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="gateway-field-label">Upstream Model</span>
                <input className="widget-input widget-code" value={aliasEditor.upstreamModel} onChange={(event) => setAliasEditor((current) => ({ ...current, upstreamModel: event.target.value }))} />
              </label>
              <label className="gateway-checkbox-row">
                <input type="checkbox" checked={aliasEditor.enabled} onChange={(event) => setAliasEditor((current) => ({ ...current, enabled: event.target.checked }))} />
                <span>Enabled</span>
              </label>
            </div>
            <div className="gateway-modal__footer">
              <button className="widget-button" type="button" onClick={() => saveAliasDraft()}>
                Save Alias
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusMessage ? <WidgetStatusBar message={statusMessage} /> : null}
    </WidgetShell>
  );
}
