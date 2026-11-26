import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { Search, X, Download, Loader2, Trash2, Check, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '../lib/store';
import {
  pullModel,
  deleteModel,
  fetchModels,
  preloadModel,
  isTauri,
  getCloudKeyStatus,
  saveCloudKey,
} from '../lib/api';
import { CATALOGUE_MODELS, CLOUD_PROVIDERS } from '../lib/model-catalogue';
import type { CloudProvider } from '../lib/model-catalogue';
import { LINE_NAMES, lineColor, lineForModel, type Line, type StationState } from '../lib/transit-lines';
import { Kbd, Station } from './transit';

type Tab = 'installed' | 'catalogue' | 'cloud';

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tab, setTab] = useState<Tab>('installed');
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSuccess, setPullSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [cloudKeyStatus, setCloudKeyStatus] = useState<Record<string, boolean>>({});
  const [cloudKeyError, setCloudKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const models = useAppStore((s) => s.models);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setModels = useAppStore((s) => s.setModels);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  const installedIds = new Set(models.map((m) => m.id));
  const desktopKeyStorage = isTauri();

  const refreshCloudKeyStatus = useCallback(async () => {
    if (!desktopKeyStorage) {
      setCloudKeyStatus({});
      return;
    }
    try {
      setCloudKeyStatus(await getCloudKeyStatus());
      setCloudKeyError(null);
    } catch (e: any) {
      setCloudKeyError(e?.message || 'Failed to read cloud key status');
    }
  }, [desktopKeyStorage]);

  const filtered = tab === 'installed'
    ? sortByLine(query
        ? models.filter((m) => m.id.toLowerCase().includes(query.toLowerCase()))
        : models)
    : tab === 'catalogue'
    ? CATALOGUE_MODELS.filter((m) =>
        !installedIds.has(m.id) &&
        (!query || m.id.toLowerCase().includes(query.toLowerCase()) || m.desc.toLowerCase().includes(query.toLowerCase()))
      )
    : []; // cloud tab doesn't use filtered

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    void refreshCloudKeyStatus();
  }, [refreshCloudKeyStatus]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, tab]);

  useEffect(() => {
    if (pullSuccess) {
      const t = setTimeout(() => setPullSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [pullSuccess]);

  const handleSelect = async (modelId: string, owner?: string) => {
    const previousModel = selectedModel;
    setSelectedModel(modelId);
    setCommandPaletteOpen(false);

    if (modelId !== previousModel) {
      const { setModelLoading, addLogEntry } = useAppStore.getState();
      setModelLoading(true);
      addLogEntry({ timestamp: Date.now(), level: 'info', category: 'model', message: `Switching to ${modelId}...` });
      try {
        await preloadModel(modelId, owner);
        addLogEntry({ timestamp: Date.now(), level: 'info', category: 'model', message: `${modelId} loaded` });
      } catch (e: any) {
        addLogEntry({ timestamp: Date.now(), level: 'error', category: 'model', message: `Failed to load ${modelId}: ${e.message}` });
      } finally {
        setModelLoading(false);
      }
    }
  };

  const refreshModels = async () => {
    try {
      const m = await fetchModels();
      setModels(m);
    } catch {}
  };

  const handlePull = async (modelId: string) => {
    setPulling(modelId);
    setPullError(null);
    try {
      await pullModel(modelId);
      setPullSuccess(modelId);
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(), level: 'info', category: 'model',
        message: `Downloaded ${modelId}`,
      });
      await refreshModels();
      setSelectedModel(modelId);
    } catch (e: any) {
      setPullError(e.message || 'Download failed');
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(), level: 'error', category: 'model',
        message: `Download failed for ${modelId}: ${e.message}`,
      });
    } finally {
      setPulling(null);
    }
  };

  const handleDelete = async (modelId: string) => {
    setDeleting(modelId);
    try {
      await deleteModel(modelId);
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(), level: 'info', category: 'model',
        message: `Deleted ${modelId}`,
      });
      await refreshModels();
      if (selectedModel === modelId) {
        const remaining = models.filter((m) => m.id !== modelId);
        if (remaining.length > 0) setSelectedModel(remaining[0].id);
      }
    } catch {} finally {
      setDeleting(null);
    }
  };

  const handleCustomPull = async () => {
    const name = customModel.trim();
    if (!name) return;
    await handlePull(name);
    setCustomModel('');
  };

  const handleSaveKey = async (provider: CloudProvider, value: string) => {
    const keyValue = value.trim();
    setSavingKey(provider.envKey);
    setCloudKeyError(null);

    try {
      await saveCloudKey(provider.envKey, keyValue);
      setApiKeys((prev) => ({ ...prev, [provider.envKey]: '' }));
      await refreshCloudKeyStatus();
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(), level: 'info', category: 'model',
        message: `${provider.name} API key ${keyValue ? 'saved' : 'removed'}. Refreshing model list...`,
      });
      await refreshModels();
    } catch (e: any) {
      setCloudKeyError(e?.message || `Failed to save ${provider.name} API key`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleKeyBlur = (provider: CloudProvider) => {
    const draft = apiKeys[provider.envKey] || '';
    if (draft.trim()) void handleSaveKey(provider, draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && tab === 'installed' && filtered.length > 0) {
      e.preventDefault();
      const model = filtered[selectedIdx] as (typeof models)[number];
      handleSelect(model.id, model.owned_by);
    }
  };

  const TAB_LABELS: Record<Tab, string> = {
    installed: `Installed Models (${models.length})`,
    catalogue: 'Download',
    cloud: 'Cloud Models',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div className="tn-scrim" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Model picker"
        className="tn-dialog relative w-full max-w-[640px] overflow-hidden flex flex-col"
        style={{ '--station-fill': 'var(--color-surface)', maxHeight: '75vh' } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="flex items-end gap-4 pl-5 pr-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div role="tablist" aria-label="Model sources" className="tn-tabs flex-1 min-w-0 overflow-x-auto" style={{ borderBottom: 'none', gap: 20 }}>
            {(['installed', 'catalogue', 'cloud'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="tn-tab shrink-0"
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            className="tn-icon-btn mb-1.5 shrink-0"
            aria-label="Close model picker"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search (not for cloud tab) */}
        {tab !== 'cloud' && (
          <div
            className="flex items-center gap-3 px-5 h-12 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tab === 'installed' ? 'Search installed models...' : 'Search models to download...'}
              aria-label={tab === 'installed' ? 'Search installed models' : 'Search models to download'}
              className="flex-1 bg-transparent outline-none text-[15px]"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
        )}

        {/* Status messages */}
        {pullError && (
          <div role="alert" className="tn-rule-fail px-5 py-2 text-[13px] font-medium shrink-0" style={{ color: 'var(--fail)' }}>
            {pullError}
          </div>
        )}
        {pullSuccess && (
          <div role="status" className="tn-rule-top px-5 py-2 text-[13px] flex items-center gap-1.5 shrink-0" style={{ color: 'var(--color-text)' }}>
            <Check size={14} /> Downloaded {pullSuccess} successfully
          </div>
        )}
        {tab === 'cloud' && cloudKeyError && (
          <div role="alert" className="tn-rule-fail px-5 py-2 text-[13px] font-medium shrink-0" style={{ color: 'var(--fail)' }}>
            {cloudKeyError}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 min-h-0 max-h-[400px] overflow-y-auto py-2">
          {tab === 'installed' ? (
            filtered.length === 0 ? (
              <div className="px-5 py-8 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                {models.length === 0
                  ? 'No models available — switch to "Download" to get started'
                  : 'No matching models'}
              </div>
            ) : (
              groupByLine(filtered as typeof models).map((group) => (
                <div key={group.line} className="mb-2 last:mb-0">
                  <LineHeader line={group.line} count={group.rows.length} />
                  {group.rows.map(({ model, idx }, i) => {
                    const isActive = model.id === selectedModel;
                    const isSelected = idx === selectedIdx;
                    const isDeleting = deleting === model.id;
                    return (
                      <div
                        key={model.id}
                        className="tn-pick-row group flex items-stretch gap-3 h-10 pl-5 pr-2"
                        data-selected={isSelected}
                        onMouseEnter={() => setSelectedIdx(idx)}
                      >
                        <Track line={group.line} state={isActive ? 'current' : 'open'} first={i === 0} last={i === group.rows.length - 1} />
                        <button
                          type="button"
                          onClick={() => handleSelect(model.id, model.owned_by)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                          aria-current={isActive || undefined}
                        >
                          <span
                            className="tn-mono text-[13px] truncate flex-1 min-w-0"
                            style={{ color: 'var(--color-text)', fontWeight: isActive ? 700 : 400 }}
                          >
                            {model.id}
                          </span>
                          {isActive && (
                            <span className="text-[12px] font-bold shrink-0" style={{ color: 'var(--color-text)' }}>
                              Active
                            </span>
                          )}
                        </button>
                        {model.owned_by !== 'litellm' && (
                          <button
                            type="button"
                            onClick={() => handleDelete(model.id)}
                            disabled={isDeleting}
                            className={`tn-icon-btn tn-pick-del self-center ${isDeleting ? '' : 'tn-reveal'}`}
                            title="Delete model"
                            aria-label={`Delete ${model.id}`}
                          >
                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )
          ) : tab === 'catalogue' ? (
            <>
              {(filtered as typeof CATALOGUE_MODELS).map((model) => {
                const isPulling = pulling === model.id;
                const justInstalled = pullSuccess === model.id;
                return (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 w-full px-5 py-2.5"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <Station line="local" state={justInstalled ? 'open' : 'unavailable'} />
                    <div className="flex-1 min-w-0">
                      <div className="tn-mono text-[13px] truncate" style={{ color: 'var(--color-text)' }}>{model.id}</div>
                      <div className="text-[12px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {model.desc} &middot; <span className="tn-mono">{model.size}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePull(model.id)}
                      disabled={isPulling || !!pulling}
                      className={`tn-btn tn-btn-sm shrink-0 ${justInstalled ? '' : 'tn-btn-primary'}`}
                    >
                      {isPulling ? <><Loader2 size={12} className="animate-spin" /> Downloading...</> :
                       justInstalled ? <><Check size={12} /> Installed</> :
                       <><Download size={12} /> Download</>}
                    </button>
                  </div>
                );
              })}
              <div className="px-5 pt-4 pb-3">
                <label htmlFor="custom-model-pull" className="block text-[13px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Or enter any Ollama model name:
                </label>
                <div className="flex gap-2">
                  <input
                    id="custom-model-pull"
                    type="text" value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCustomPull(); } }}
                    placeholder="e.g. codellama:7b"
                    className="tn-input tn-mono flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleCustomPull} disabled={!customModel.trim() || !!pulling}
                    className="tn-btn shrink-0"
                  >
                    <Download size={14} /> Pull
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── Cloud Models tab ── */
            <div className="px-5 py-2">
              <p className="text-[13px] mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                {desktopKeyStorage
                  ? 'Add your API keys to use cloud models. Keys are stored in secure desktop storage.'
                  : 'Configure cloud provider keys in the server environment to use cloud models.'}
              </p>

              {CLOUD_PROVIDERS.map((provider) => {
                const key = apiKeys[provider.envKey] || '';
                const hasSavedKey = !!cloudKeyStatus[provider.envKey];
                const hasKey = hasSavedKey || !!key.trim();
                const isVisible = showKeys[provider.envKey];
                const isSaving = savingKey === provider.envKey;
                const keyInputId = `cloud-key-${provider.envKey}`;

                return (
                  <div key={provider.name} className="mb-5 last:mb-2">
                    {/* Provider station */}
                    <div className="flex items-stretch gap-3 h-9">
                      <Track line="cloud" state={hasKey ? 'open' : 'unavailable'} first />
                      <label htmlFor={keyInputId} className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-[14px] font-bold truncate" style={{ color: 'var(--color-text)' }}>{provider.name}</span>
                        {hasKey && (
                          <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                            Connected
                          </span>
                        )}
                      </label>
                    </div>

                    {/* API key input */}
                    <div className="flex items-stretch gap-3">
                      <Rail line="cloud" />
                      <div className="flex gap-2 flex-1 min-w-0 py-1.5">
                        <div className="relative flex-1 min-w-0">
                          <input
                            id={keyInputId}
                            type={isVisible ? 'text' : 'password'}
                            value={key}
                            onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.envKey]: e.target.value }))}
                            onBlur={() => handleKeyBlur(provider)}
                            placeholder={hasSavedKey ? 'Saved in secure storage' : provider.envKey}
                            disabled={!desktopKeyStorage || isSaving}
                            className="tn-input tn-mono"
                            style={{ paddingRight: 40, fontSize: 13 }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowKeys((prev) => ({ ...prev, [provider.envKey]: !prev[provider.envKey] }))}
                            className="tn-icon-btn absolute right-0.5 top-0.5"
                            aria-label={isVisible ? 'Hide key' : 'Show key'}
                            aria-pressed={!!isVisible}
                          >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        {hasSavedKey && (
                          <button
                            type="button"
                            onClick={() => handleSaveKey(provider, '')}
                            disabled={isSaving}
                            className="tn-btn tn-btn-danger shrink-0"
                          >
                            {isSaving ? 'Saving' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Models for this provider */}
                    {provider.models.map((model, i) => {
                      const isActive = model.id === selectedModel;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => handleSelect(model.id)}
                          className="tn-dest flex items-stretch gap-3 w-full min-h-11 text-left cursor-pointer"
                          aria-current={isActive || undefined}
                        >
                          <Track
                            line="cloud"
                            state={isActive ? 'current' : hasKey ? 'open' : 'unavailable'}
                            last={i === provider.models.length - 1}
                          />
                          <span className="flex-1 min-w-0 py-1.5">
                            <span
                              className="tn-mono block text-[13px] truncate"
                              style={{ color: 'var(--color-text)', fontWeight: isActive ? 700 : 400 }}
                            >
                              {model.id}
                            </span>
                            <span className="block text-[12px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                              {model.desc}
                            </span>
                          </span>
                          {isActive && (
                            <span className="self-center text-[12px] font-bold pr-2 shrink-0" style={{ color: 'var(--color-text)' }}>
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[12px] shrink-0"
          style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {tab === 'installed' ? (
            <>
              <span className="inline-flex items-center gap-1.5"><Kbd>↑↓</Kbd> Navigate</span>
              <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd> Select</span>
              <span className="inline-flex items-center gap-1.5"><Kbd>Esc</Kbd> Close</span>
            </>
          ) : tab === 'catalogue' ? (
            <span>Models are downloaded from the Ollama registry</span>
          ) : (
            <span>API keys are stored locally and never sent to OpenJarvis servers</span>
          )}
        </div>
      </div>
    </div>
  );
}

const LINE_ORDER: Line[] = ['local', 'cloud', 'tools', 'data', 'none'];

/** Installed models, local line first, then cloud; order within a line is kept. */
function sortByLine<T extends { id: string; owned_by?: string }>(list: T[]): T[] {
  return list
    .map((model, i) => ({ model, i, rank: LINE_ORDER.indexOf(lineForModel(model.id, model.owned_by)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((entry) => entry.model);
}

function groupByLine<T extends { id: string; owned_by?: string }>(list: T[]) {
  const groups: Array<{ line: Line; rows: Array<{ model: T; idx: number }> }> = [];
  list.forEach((model, idx) => {
    const line = lineForModel(model.id, model.owned_by);
    const last = groups[groups.length - 1];
    if (last && last.line === line) last.rows.push({ model, idx });
    else groups.push({ line, rows: [{ model, idx }] });
  });
  return groups;
}

function LineHeader({ line, count }: { line: Line; count: number }) {
  return (
    <div className="flex items-center gap-2 h-8 px-5">
      <span aria-hidden="true" style={{ width: 16, height: 5, background: lineColor(line) }} />
      <span className="text-[13px] font-bold flex-1" style={{ color: 'var(--color-text)' }}>
        {LINE_NAMES[line] || 'Other'}
      </span>
      <span className="tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{count}</span>
    </div>
  );
}

/** A station on a vertical line; half-rails join it to its neighbours. */
function Track({ line, state, first = false, last = false }: { line: Line; state: StationState; first?: boolean; last?: boolean }) {
  return (
    <span aria-hidden="true" className="relative flex items-center shrink-0" style={{ width: 14 }}>
      {!first && <span className="absolute" style={{ left: 4.5, width: 5, top: 0, bottom: '50%', background: lineColor(line) }} />}
      {!last && <span className="absolute" style={{ left: 4.5, width: 5, top: '50%', bottom: 0, background: lineColor(line) }} />}
      <Station line={line} state={state} className="relative z-[1]" />
    </span>
  );
}

/** The line running past a row that has no station of its own. */
function Rail({ line }: { line: Line }) {
  return (
    <span aria-hidden="true" className="relative shrink-0" style={{ width: 14 }}>
      <span className="absolute" style={{ left: 4.5, width: 5, top: 0, bottom: 0, background: lineColor(line) }} />
    </span>
  );
}