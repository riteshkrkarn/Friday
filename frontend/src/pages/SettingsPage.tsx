import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Check, Sun, Moon, Monitor, Download, Upload, Trash2, RefreshCw } from 'lucide-react';
import { useAppStore, type ThemeMode } from '../lib/store';
import { deviceTimeZone, listTimeZones, resolveTimeZone, utcOffsetLabel } from '../lib/timezone';
import {
  checkHealth,
  fetchSpeechHealth,
  fetchTtsHealth,
  getMemoryStats,
  getInferenceSource,
  setInferenceSource,
  getCloudKeyStatus,
  saveCloudKey,
  fetchToolCredentialStatus,
  saveToolCredentials,
  deleteToolCredential,
  isTauri,
  type InferenceSource,
  type MemoryStats,
} from '../lib/api';
import { isAutoUpdateDisabled, setAutoUpdateDisabled } from '../components/Desktop/UpdateChecker';
import { LineMap, PageHeader, SectionHeading, Station, StatusText } from '../components/transit';
import { lineColor, type Line, type StationState } from '../lib/transit-lines';

const CLOUD_KEY_STATUS_CHANGED = 'openjarvis-cloud-key-status-changed';

/** Control widths: full width in the single-column layout, fixed beside the label from md up. */
const FIELD = 'tn-input md:w-64';
const SELECT = 'tn-select md:w-64 cursor-pointer';

function OllamaModelList() {
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  useEffect(() => {
    fetch('http://localhost:11434/api/tags')
      .then(r => r.json())
      .then(data => setModels((data.models || []).map((m: any) => ({ name: m.name, size: m.size }))))
      .catch(() => setModels([]));
  }, []);
  if (models.length === 0) return <StatusText tone="muted" mono={false}>No models loaded</StatusText>;
  return (
    <LineMap
      label="Local models"
      className="md:w-64"
      items={models.map((m) => ({
        id: m.name,
        line: 'local' as const,
        label: <span className="tn-mono text-[13px]">{m.name}</span>,
        status: `${(m.size / 1e9).toFixed(1)} GB`,
      }))}
    />
  );
}

function ApiKeyInput({
  keyName,
  placeholder,
  toolName,
}: {
  keyName: string;
  placeholder: string;
  toolName?: string;
}) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [error, setError] = useState('');
  const desktopKeyStorage = isTauri();
  const serverToolStorage = !desktopKeyStorage && !!toolName;
  const canManage = desktopKeyStorage || serverToolStorage;

  const refresh = useCallback(async () => {
    if (!canManage) {
      setHasKey(false);
      return;
    }
    try {
      const status = desktopKeyStorage
        ? await getCloudKeyStatus()
        : await fetchToolCredentialStatus(toolName!);
      setHasKey(!!status[keyName]);
    } catch {
      setHasKey(false);
    }
  }, [canManage, desktopKeyStorage, keyName, toolName]);

  useEffect(() => {
    void refresh();
    window.addEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
    return () => window.removeEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
  }, [refresh]);

  const save = async (v: string) => {
    const next = v.trim();
    if (!next) return;
    setError('');
    try {
      if (desktopKeyStorage) {
        await saveCloudKey(keyName, next);
      } else if (toolName) {
        await saveToolCredentials(toolName, { [keyName]: next });
      } else {
        return;
      }
      setValue('');
      setHasKey(true);
      setSaved(true);
      window.dispatchEvent(new Event(CLOUD_KEY_STATUS_CHANGED));
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message || 'Failed to save API key');
    }
  };

  const remove = async () => {
    setError('');
    try {
      if (desktopKeyStorage) {
        await saveCloudKey(keyName, '');
      } else if (toolName) {
        await deleteToolCredential(toolName, keyName);
      } else {
        return;
      }
      setValue('');
      setHasKey(false);
      setSaved(true);
      window.dispatchEvent(new Event(CLOUD_KEY_STATUS_CHANGED));
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message || 'Failed to remove API key');
    }
  };

  return (
    <div className="flex flex-col gap-1 md:items-end">
      <div className="flex items-center gap-2 w-full md:w-auto">
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => { if (value.trim()) void save(value); }}
          placeholder={hasKey ? (desktopKeyStorage ? 'Saved in secure storage' : 'Saved by local server') : placeholder}
          disabled={!canManage}
          className="tn-input tn-mono md:w-64"
        />
        {hasKey && (
          <button type="button" onClick={() => void remove()} className="tn-btn tn-btn-sm tn-btn-danger">
            Remove
          </button>
        )}
      </div>
      {(saved || error) && (
        <span aria-live="polite">
          {saved && <StatusText>Saved</StatusText>}
          {error && <StatusText tone="fail" mono={false}>{error}</StatusText>}
        </span>
      )}
    </div>
  );
}

function CloudProviderStatus({
  label,
  keyName,
  first,
  last,
}: {
  label: string;
  keyName: string;
  first?: boolean;
  last?: boolean;
}) {
  const [hasKey, setHasKey] = useState(false);
  const desktopKeyStorage = isTauri();

  const refresh = useCallback(async () => {
    if (!desktopKeyStorage) {
      setHasKey(false);
      return;
    }
    try {
      const status = await getCloudKeyStatus();
      setHasKey(!!status[keyName]);
    } catch {
      setHasKey(false);
    }
  }, [desktopKeyStorage, keyName]);

  useEffect(() => {
    void refresh();
    window.addEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
    return () => window.removeEventListener(CLOUD_KEY_STATUS_CHANGED, refresh);
  }, [refresh]);

  return (
    <li className="tn-linemap-item">
      {!first && (
        <span aria-hidden="true" className="tn-linemap-rail" data-half="top" style={{ background: lineColor('cloud') }} />
      )}
      {!last && (
        <span aria-hidden="true" className="tn-linemap-rail" data-half="bottom" style={{ background: lineColor('cloud') }} />
      )}
      <Station line="cloud" state={hasKey ? 'open' : 'unavailable'} className="relative z-[1]" />
      <span className="flex-1 min-w-0 truncate text-[14px]" style={{ color: 'var(--color-text)' }}>{label}</span>
      <StatusText tone={hasKey ? 'default' : 'muted'}>{hasKey ? 'key set' : 'no key'}</StatusText>
    </li>
  );
}

const CLOUD_PROVIDER_KEYS = [
  { label: 'OpenAI', keyName: 'OPENAI_API_KEY' },
  { label: 'Anthropic', keyName: 'ANTHROPIC_API_KEY' },
  { label: 'Google', keyName: 'GEMINI_API_KEY' },
  { label: 'OpenRouter', keyName: 'OPENROUTER_API_KEY' },
  { label: 'Atlas Cloud', keyName: 'ATLASCLOUD_API_KEY' },
];

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-8">
      <SectionHeading as="h2" id={id}>{title}</SectionHeading>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/**
 * A ruled two-column row: label and description on the left, the control on
 * the right. One column below 768px. `station` marks rows that stand for a
 * stop on the network (an engine, provider, tool or memory backend).
 */
function SettingRow({
  label,
  description,
  station,
  children,
}: {
  label: string;
  description?: string;
  station?: { line: Line; state?: StationState };
  children: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 gap-y-2 py-4"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="min-w-0 flex gap-3">
        {station && <Station line={station.line} state={station.state} className="mt-[4px]" />}
        <div className="min-w-0">
          {label && <div className="text-[15px] font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>}
          {description && (
            <div className="text-[13px] leading-[18px] mt-0.5 break-words max-w-[60ch]" style={{ color: 'var(--color-text-secondary)' }}>
              {description}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 md:justify-self-end">{children}</div>
    </div>
  );
}

/** A square-knob switch. Blue when on: blue is the selection colour. */
function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className="relative inline-flex items-center h-[22px] w-[40px] shrink-0 cursor-pointer"
      style={{
        border: `2px solid ${checked ? 'var(--action)' : 'var(--color-input-border)'}`,
        borderRadius: 2,
        background: checked ? 'var(--action)' : 'transparent',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute top-[3px] left-[3px] h-3 w-3"
        style={{
          borderRadius: 1,
          background: checked ? 'var(--on-action)' : 'var(--color-text-secondary)',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 140ms ease-out, background-color 120ms ease-out',
        }}
      />
    </button>
  );
}

/** A 3-way segmented control; the chosen segment is filled with the action blue. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: typeof Sun }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex w-full md:w-auto"
      style={{ border: '2px solid var(--color-input-border)', borderRadius: 2 }}
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className="flex flex-1 md:flex-none items-center justify-center gap-1.5 h-8 px-3 text-[13px] font-medium cursor-pointer"
            style={{
              background: active ? 'var(--action)' : 'transparent',
              color: active ? 'var(--on-action)' : 'var(--color-text-secondary)',
              borderLeft: i > 0 ? '1px solid var(--color-border)' : undefined,
              transition: 'background-color 120ms ease-out, color 120ms ease-out',
            }}
          >
            {opt.icon && <opt.icon size={14} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Range input with its value printed beside it in mono. */
function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 md:w-64">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 cursor-pointer accent-[var(--action)]"
      />
      <output className="tn-mono text-[13px] w-12 text-right" style={{ color: 'var(--color-text)' }}>
        {value}
      </output>
    </div>
  );
}

type MemoryStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; stats: MemoryStats }
  | { kind: 'error'; message: string };

export function MemoryStatusRow({
  status,
  onRetry,
}: {
  status: MemoryStatus;
  onRetry: () => void;
}) {
  const stats = status.kind === 'ready' ? status.stats : null;
  const description = status.kind === 'error'
    ? status.message
    : status.kind === 'loading'
      ? 'Checking memory backend...'
      : stats?.backend === 'none'
        ? 'Memory is not configured'
        : `${stats?.backend} backend — ${stats?.entries} entries`;
  const label = status.kind === 'loading'
    ? 'Checking...'
    : stats?.backend === 'none'
      ? 'Not configured'
      : stats
        ? `${stats.entries} entries`
        : 'Unavailable';
  const stationState: StationState = status.kind === 'error'
    ? 'failed'
    : stats && stats.backend !== 'none'
      ? 'open'
      : 'unavailable';

  return (
    <SettingRow label="Memory status" description={description} station={{ line: 'data', state: stationState }}>
      <div className="flex items-center gap-3">
        <StatusText tone={status.kind === 'error' ? 'fail' : 'default'} className="whitespace-nowrap">
          {label}
        </StatusText>
        {status.kind === 'error' && (
          <button type="button" onClick={onRetry} className="tn-btn tn-btn-sm">
            Retry
          </button>
        )}
      </div>
    </SettingRow>
  );
}

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const fontSizeOptions: { value: 'small' | 'default' | 'large'; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const timeZones = useMemo(listTimeZones, []);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const conversations = useAppStore((s) => s.conversations);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [speechBackendAvailable, setSpeechBackendAvailable] = useState<boolean | null>(null);
  const [ttsBackend, setTtsBackend] = useState<{ available: boolean; backend?: string; voice_id?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(() => !isAutoUpdateDisabled());
  const [updateCheckState, setUpdateCheckState] = useState<'idle' | 'checking' | 'available' | 'latest'>('idle');

  const handleAutoUpdateToggle = useCallback((enabled: boolean) => {
    setAutoUpdateEnabled(enabled);
    setAutoUpdateDisabled(!enabled);
  }, []);

  const handleCheckNow = useCallback(async () => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    setUpdateCheckState('checking');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      setUpdateCheckState(update ? 'available' : 'latest');
      setTimeout(() => setUpdateCheckState('idle'), 4000);
    } catch {
      setUpdateCheckState('idle');
    }
  }, []);

  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus>({ kind: 'loading' });
  const memoryRequestId = useRef(0);
  const [memoryEnabled, setMemoryEnabled] = useState(() => {
    try { return localStorage.getItem('openjarvis-memory-enabled') !== 'false'; } catch { return true; }
  });
  const [memoryBackend, setMemoryBackend] = useState(() => {
    try { return localStorage.getItem('openjarvis-memory-backend') || 'sqlite'; } catch { return 'sqlite'; }
  });
  const [memoryTopK, setMemoryTopK] = useState(() => {
    try { return parseInt(localStorage.getItem('openjarvis-memory-top-k') || '5'); } catch { return 5; }
  });
  const [memoryMinScore, setMemoryMinScore] = useState(() => {
    try { return parseFloat(localStorage.getItem('openjarvis-memory-min-score') || '0.1'); } catch { return 0.1; }
  });
  const [memoryMaxTokens, setMemoryMaxTokens] = useState(() => {
    try { return parseInt(localStorage.getItem('openjarvis-memory-max-tokens') || '2048'); } catch { return 2048; }
  });

  const [srcKind, setSrcKind] = useState<InferenceSource['kind']>('ollama');
  const [customHost, setCustomHost] = useState('http://localhost:1234/v1');
  const [customModel, setCustomModel] = useState('');
  const [customEngine, setCustomEngine] = useState('lmstudio');
  const [customKey, setCustomKey] = useState('');
  const [srcMsg, setSrcMsg] = useState('');

  useEffect(() => {
    getInferenceSource().then((s) => {
      setSrcKind(s.kind);
      if (s.host) setCustomHost(s.host);
      if (s.model) setCustomModel(s.model);
      if (s.engine) setCustomEngine(s.engine);
    }).catch(() => {});
  }, []);

  const saveSource = useCallback(async () => {
    try {
      if (srcKind === 'custom') {
        await setInferenceSource({ kind: 'custom', host: customHost, model: customModel, engine: customEngine, apiKey: customKey || undefined });
      } else {
        await setInferenceSource({ kind: 'ollama' });
      }
      setSrcMsg('Saved — restart the app to apply.');
    } catch (e: any) {
      setSrcMsg(e?.message ?? 'Failed to save.');
    }
  }, [srcKind, customHost, customModel, customEngine, customKey]);

  const refreshMemoryStatus = useCallback(async () => {
    const requestId = ++memoryRequestId.current;
    setMemoryStatus({ kind: 'loading' });
    try {
      const stats = await getMemoryStats();
      if (requestId === memoryRequestId.current) {
        setMemoryStatus({ kind: 'ready', stats });
      }
    } catch (error) {
      if (requestId === memoryRequestId.current) {
        setMemoryStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, []);

  useEffect(() => {
    void refreshMemoryStatus();
    const onFocus = () => { void refreshMemoryStatus(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      ++memoryRequestId.current;
    };
  }, [refreshMemoryStatus, settings.apiUrl]);

  useEffect(() => {
    checkHealth().then(setHealthy);
    fetchSpeechHealth()
      .then((h) => setSpeechBackendAvailable(h.available))
      .catch(() => setSpeechBackendAvailable(false));
    fetchTtsHealth()
      .then((h) => setTtsBackend(h))
      .catch(() => setTtsBackend({ available: false }));
  }, []);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = () => {
    const data = localStorage.getItem('openjarvis-conversations') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openjarvis-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.version === 1) {
            localStorage.setItem('openjarvis-conversations', JSON.stringify(data));
            useAppStore.getState().loadConversations();
            showSaved();
          }
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    localStorage.removeItem('openjarvis-conversations');
    useAppStore.getState().loadConversations();
    setConfirmClear(false);
    showSaved();
  };

  const linkStyle = { color: 'var(--action)', textUnderlineOffset: 3 } as const;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
      <div className="max-w-[880px] mx-auto pb-16">
        <PageHeader
          title="Settings"
          actions={
            <span aria-live="polite" className="h-5">
              {saved && (
                <span className="tn-mono inline-flex items-center gap-1 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <Check size={12} aria-hidden="true" /> Saved
                </span>
              )}
            </span>
          }
        />
        <p className="text-[14px] mt-3 max-w-[65ch]" style={{ color: 'var(--color-text-secondary)' }}>
          App preferences — appearance, model defaults, keyboard shortcuts, and data management.
        </p>

        <Section title="Appearance" id="settings-appearance">
          <SettingRow label="Theme" description="Choose how OpenJarvis looks">
            <Segmented
              label="Theme"
              value={settings.theme}
              options={themeOptions}
              onChange={(v) => { updateSettings({ theme: v }); showSaved(); }}
            />
          </SettingRow>
          <SettingRow label="Font size">
            <Segmented
              label="Font size"
              value={settings.fontSize}
              options={fontSizeOptions}
              onChange={(v) => { updateSettings({ fontSize: v }); showSaved(); }}
            />
          </SettingRow>
          <SettingRow
            label="Time zone"
            description={`Dates and times in answers use this zone. Now: ${resolveTimeZone(settings.timeZone)} (${utcOffsetLabel(resolveTimeZone(settings.timeZone))})`}
          >
            <select
              aria-label="Time zone"
              value={settings.timeZone}
              onChange={(e) => { updateSettings({ timeZone: e.target.value }); showSaved(); }}
              className={SELECT}
            >
              <option value="">Automatic ({deviceTimeZone()})</option>
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </SettingRow>
        </Section>

        <Section title="Connection" id="settings-connection">
          <SettingRow
            label="Server status"
            description={serverInfo ? `${serverInfo.engine} / ${serverInfo.model}` : 'Not connected'}
            station={{
              line: 'local',
              state: healthy === true ? 'open' : healthy === false ? 'failed' : 'unavailable',
            }}
          >
            <StatusText tone={healthy === false ? 'fail' : 'default'}>
              {healthy === true ? 'Connected' : healthy === false ? 'Disconnected' : 'Checking...'}
            </StatusText>
          </SettingRow>
          <SettingRow label="API URL" description="Set if backend runs on a different port or host">
            <input
              type="text"
              aria-label="API URL"
              value={settings.apiUrl}
              onChange={(e) => { updateSettings({ apiUrl: e.target.value }); showSaved(); }}
              placeholder="http://localhost:8000"
              className={`${FIELD} tn-mono`}
            />
          </SettingRow>
          <SettingRow label="API key" description="Required only if the server was started with an API key">
            <input
              type="password"
              aria-label="API key"
              value={settings.apiKey}
              onChange={(e) => { updateSettings({ apiKey: e.target.value }); showSaved(); }}
              placeholder="OPENJARVIS_API_KEY"
              autoComplete="off"
              className={`${FIELD} tn-mono`}
            />
          </SettingRow>
        </Section>

        <Section title="Inference source" id="settings-inference">
          <SettingRow
            label="Source"
            description="Where the app runs models. Applies after restart."
            station={{ line: 'local' }}
          >
            <select
              aria-label="Inference source"
              value={srcKind}
              onChange={(e) => { setSrcKind(e.target.value as InferenceSource['kind']); setSrcMsg(''); }}
              className={SELECT}
            >
              <option value="ollama">Bundled Ollama (default)</option>
              <option value="custom">Custom OpenAI-compatible server</option>
            </select>
          </SettingRow>
          {srcKind === 'custom' && (
            <>
              <SettingRow label="Server URL" description="e.g. LM Studio: http://localhost:1234/v1">
                <input type="text" aria-label="Server URL" value={customHost} onChange={(e) => { setCustomHost(e.target.value); setSrcMsg(''); }} placeholder="http://localhost:1234/v1"
                  className={`${FIELD} tn-mono`} />
              </SettingRow>
              <SettingRow label="Model" description="Model id served by your endpoint">
                <input type="text" aria-label="Model" value={customModel} onChange={(e) => { setCustomModel(e.target.value); setSrcMsg(''); }} placeholder="qwen2.5-7b-instruct"
                  className={`${FIELD} tn-mono`} />
              </SettingRow>
              <SettingRow label="Server type" description="OpenAI-compatible engine">
                <select aria-label="Server type" value={customEngine} onChange={(e) => { setCustomEngine(e.target.value); setSrcMsg(''); }}
                  className={SELECT}>
                  <option value="lmstudio">LM Studio</option>
                  <option value="vllm">vLLM</option>
                  <option value="sglang">SGLang</option>
                  <option value="llamacpp">llama.cpp</option>
                  <option value="mlx">MLX</option>
                </select>
              </SettingRow>
              <SettingRow label="API key (optional)" description="Only if your server requires one">
                <input type="password" aria-label="Custom server API key" value={customKey} onChange={(e) => { setCustomKey(e.target.value); setSrcMsg(''); }} placeholder="leave blank if none"
                  className={`${FIELD} tn-mono`} />
              </SettingRow>
            </>
          )}
          <SettingRow label="" description={srcMsg}>
            <button type="button" onClick={saveSource} className="tn-btn tn-btn-primary w-full md:w-auto">
              Save inference source
            </button>
          </SettingRow>
        </Section>

        <Section title="Models" id="settings-models">
          <SettingRow label="Local models (Ollama)" description="Models available for local inference">
            <OllamaModelList />
          </SettingRow>
          <p className="text-[13px] py-3" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
            Run <code className="tn-mono px-1 py-0.5 text-[12px]" style={{ background: 'var(--color-code-bg)', borderRadius: 2 }}>ollama pull &lt;model-name&gt;</code> in your terminal to add more models
          </p>
          <SettingRow label="Cloud providers" description="A solid station means the API key is configured; dashed means no key">
            <ul className="tn-linemap md:w-64" aria-label="Cloud providers">
              {CLOUD_PROVIDER_KEYS.map((p, i) => (
                <CloudProviderStatus
                  key={p.keyName}
                  label={p.label}
                  keyName={p.keyName}
                  first={i === 0}
                  last={i === CLOUD_PROVIDER_KEYS.length - 1}
                />
              ))}
            </ul>
          </SettingRow>
        </Section>

        <Section title="API Keys" id="settings-keys">
          <SettingRow label="OpenAI" description="GPT-4, GPT-3.5, etc." station={{ line: 'cloud' }}>
            <ApiKeyInput keyName="OPENAI_API_KEY" placeholder="sk-..." />
          </SettingRow>
          <SettingRow label="Anthropic" description="Claude models" station={{ line: 'cloud' }}>
            <ApiKeyInput keyName="ANTHROPIC_API_KEY" placeholder="sk-ant-..." />
          </SettingRow>
          <SettingRow label="Google" description="Gemini models" station={{ line: 'cloud' }}>
            <ApiKeyInput keyName="GEMINI_API_KEY" placeholder="AI..." />
          </SettingRow>
          <SettingRow label="OpenRouter" description="Multi-provider routing" station={{ line: 'cloud' }}>
            <ApiKeyInput keyName="OPENROUTER_API_KEY" placeholder="sk-or-..." />
          </SettingRow>
          <SettingRow label="Atlas Cloud" description="Models routed through Atlas Cloud" station={{ line: 'cloud' }}>
            <ApiKeyInput keyName="ATLASCLOUD_API_KEY" placeholder="Atlas Cloud API key" />
          </SettingRow>
        </Section>

        <Section title="Tools" id="settings-tools">
          <SettingRow label="Web Search" description="Tavily key for web search tool" station={{ line: 'tools' }}>
            <ApiKeyInput keyName="TAVILY_API_KEY" placeholder="tvly-..." toolName="web_search" />
          </SettingRow>
        </Section>

        <Section title="Memory" id="settings-memory">
          <MemoryStatusRow status={memoryStatus} onRetry={() => { void refreshMemoryStatus(); }} />
          <SettingRow label="Use memory context" description="Automatically inject relevant memories into conversations">
            <Switch
              label="Use memory context"
              checked={memoryEnabled}
              onChange={() => {
                const next = !memoryEnabled;
                setMemoryEnabled(next);
                try { localStorage.setItem('openjarvis-memory-enabled', String(next)); } catch {}
                showSaved();
              }}
            />
          </SettingRow>
          <SettingRow label="Memory backend" description="Which retrieval engine to use">
            <select
              aria-label="Memory backend"
              value={memoryBackend}
              onChange={(e) => {
                setMemoryBackend(e.target.value);
                try { localStorage.setItem('openjarvis-memory-backend', e.target.value); } catch {}
                showSaved();
              }}
              className={`${SELECT} tn-mono`}
            >
              <option value="sqlite">sqlite</option>
              <option value="faiss">faiss</option>
              <option value="bm25">bm25</option>
              <option value="colbert">colbert</option>
              <option value="hybrid">hybrid</option>
            </select>
          </SettingRow>
          <SettingRow label="Results to inject">
            <Range
              label="Results to inject"
              min={1}
              max={20}
              step={1}
              value={memoryTopK}
              onChange={(raw) => {
                const v = parseInt(raw);
                setMemoryTopK(v);
                try { localStorage.setItem('openjarvis-memory-top-k', String(v)); } catch {}
                showSaved();
              }}
            />
          </SettingRow>
          <SettingRow label="Min relevance score">
            <Range
              label="Min relevance score"
              min={0}
              max={1}
              step={0.05}
              value={memoryMinScore}
              onChange={(raw) => {
                const v = parseFloat(raw);
                setMemoryMinScore(v);
                try { localStorage.setItem('openjarvis-memory-min-score', String(v)); } catch {}
                showSaved();
              }}
            />
          </SettingRow>
          <SettingRow label="Max context tokens">
            <Range
              label="Max context tokens"
              min={256}
              max={8192}
              step={256}
              value={memoryMaxTokens}
              onChange={(raw) => {
                const v = parseInt(raw);
                setMemoryMaxTokens(v);
                try { localStorage.setItem('openjarvis-memory-max-tokens', String(v)); } catch {}
                showSaved();
              }}
            />
          </SettingRow>
        </Section>

        <Section title="Model Defaults" id="settings-model-defaults">
          <SettingRow label="Temperature">
            <Range
              label="Temperature"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(raw) => { updateSettings({ temperature: parseFloat(raw) }); showSaved(); }}
            />
          </SettingRow>
          <SettingRow label="Max tokens">
            <Range
              label="Max tokens"
              min={256}
              max={32768}
              step={256}
              value={settings.maxTokens}
              onChange={(raw) => { updateSettings({ maxTokens: parseInt(raw) }); showSaved(); }}
            />
          </SettingRow>
        </Section>

        <Section title="Speech" id="settings-speech">
          <SettingRow label="Speech-to-Text" description="Enable microphone input for voice dictation">
            <Switch
              label="Speech-to-Text"
              checked={settings.speechEnabled}
              onChange={() => { updateSettings({ speechEnabled: !settings.speechEnabled }); showSaved(); }}
            />
          </SettingRow>
          <SettingRow label="Text-to-Speech" description="Show a read-aloud button on assistant replies">
            <Switch
              label="Text-to-Speech"
              checked={settings.voiceOutputEnabled}
              onChange={() => { updateSettings({ voiceOutputEnabled: !settings.voiceOutputEnabled }); showSaved(); }}
            />
          </SettingRow>
          <SettingRow label="Speak replies automatically" description="Read every assistant reply aloud as soon as it finishes">
            <Switch
              label="Speak replies automatically"
              checked={settings.voiceAutoplay && settings.voiceOutputEnabled}
              disabled={!settings.voiceOutputEnabled}
              onChange={() => { updateSettings({ voiceAutoplay: !settings.voiceAutoplay }); showSaved(); }}
            />
          </SettingRow>
          <SettingRow label="Voice" description="Backend and voice used for spoken replies">
            <StatusText tone={ttsBackend?.available ? 'default' : 'muted'}>
              {ttsBackend === null ? 'Checking...'
                : ttsBackend.available ? `${ttsBackend.backend}${ttsBackend.voice_id ? ` / ${ttsBackend.voice_id}` : ''}`
                : 'Not configured'}
            </StatusText>
          </SettingRow>
          <SettingRow label="Backend status" description="Requires Whisper, Deepgram, or another speech backend">
            <StatusText tone={speechBackendAvailable ? 'default' : 'muted'}>
              {speechBackendAvailable === null ? 'Checking...'
                : speechBackendAvailable ? 'Available'
                : 'Not configured'}
            </StatusText>
          </SettingRow>
          {!speechBackendAvailable && speechBackendAvailable !== null && (
            <p className="text-[13px] py-3" style={{ color: 'var(--color-text-secondary)' }}>
              Set up a speech backend to use voice input.
              See the <a href="https://open-jarvis.github.io/OpenJarvis/user-guide/tools/" target="_blank" rel="noopener noreferrer" className="underline" style={linkStyle}>documentation</a> for details.
            </p>
          )}
        </Section>

        <Section title="Data" id="settings-data">
          <SettingRow label="Conversations" description={`${conversations.length} stored locally`}>
            <div className="flex gap-2">
              <button type="button" onClick={handleExport} className="tn-btn tn-btn-sm">
                <Download size={14} aria-hidden="true" /> Export
              </button>
              <button type="button" onClick={handleImport} className="tn-btn tn-btn-sm">
                <Upload size={14} aria-hidden="true" /> Import
              </button>
            </div>
          </SettingRow>
          <SettingRow label="Clear all data" description="Permanently delete all conversations">
            <button
              type="button"
              onClick={handleClear}
              className="tn-btn tn-btn-sm tn-btn-danger"
              style={confirmClear ? { background: 'var(--fail)', color: 'var(--on-action)' } : undefined}
            >
              <Trash2 size={14} aria-hidden="true" /> {confirmClear ? 'Click again to confirm' : 'Clear'}
            </button>
          </SettingRow>
        </Section>

        <Section title="Updates" id="settings-updates">
          <SettingRow label="Auto-update" description="Check for new desktop builds automatically every 30 minutes">
            <Switch
              label="Auto-update"
              checked={autoUpdateEnabled}
              onChange={() => handleAutoUpdateToggle(!autoUpdateEnabled)}
            />
          </SettingRow>
          <SettingRow label="Check for updates" description="Manually check for a new version right now">
            <button
              type="button"
              onClick={handleCheckNow}
              className="tn-btn tn-btn-sm"
              disabled={updateCheckState === 'checking'}
            >
              <RefreshCw size={14} aria-hidden="true" className={updateCheckState === 'checking' ? 'animate-spin' : ''} />
              {updateCheckState === 'checking' && 'Checking...'}
              {updateCheckState === 'available' && 'Update available — see banner above'}
              {updateCheckState === 'latest' && 'Already up to date'}
              {updateCheckState === 'idle' && 'Check now'}
            </button>
          </SettingRow>
        </Section>

        <Section title="About" id="settings-about">
          <div className="py-4 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
            <p className="mb-1">
              <span className="font-bold" style={{ color: 'var(--color-text)' }}>OpenJarvis</span> — Programming abstractions for on-device AI.
            </p>
            <p className="text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Part of Intelligence Per Watt, a research initiative at Stanford SAIL.
            </p>
            <div className="flex gap-5 mt-3 text-[13px]">
              <a href="https://openjarvis.stanford.edu/" target="_blank" rel="noopener noreferrer" className="underline" style={linkStyle}>
                Project site
              </a>
              <a href="https://open-jarvis.github.io/OpenJarvis/" target="_blank" rel="noopener noreferrer" className="underline" style={linkStyle}>
                Documentation
              </a>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
