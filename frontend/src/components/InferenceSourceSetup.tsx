import { useReducer, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { Station } from './transit';
import {
  resetInferenceSource,
  stageInferenceSource,
  startBackend,
  type InferenceSource,
} from '../lib/api';

export type InferenceSetupStep = 'choose' | 'ollama' | 'custom';
export type InferenceSetupAction = 'choose_ollama' | 'choose_custom' | 'back';
export type InferenceSourceSubmission = InferenceSource & { apiKey?: string };

/** Pure navigation state: merely inspecting a source can never start setup. */
export function inferenceSetupReducer(
  state: InferenceSetupStep,
  action: InferenceSetupAction,
): InferenceSetupStep {
  switch (action) {
    case 'choose_ollama':
      return 'ollama';
    case 'choose_custom':
      return 'custom';
    case 'back':
      return 'choose';
    default:
      return state;
  }
}

/**
 * Persist first, start second. Dependency injection keeps the consent boundary
 * directly testable without a Tauri runtime.
 */
export async function persistAndStartInferenceSource(
  source: InferenceSourceSubmission,
  persist: (value: InferenceSourceSubmission) => Promise<void> = stageInferenceSource,
  start: () => Promise<void> = startBackend,
  rollback: () => Promise<void> = resetInferenceSource,
): Promise<void> {
  let persisted = false;
  try {
    await persist(source);
    persisted = true;
    await start();
  } catch (error) {
    if (persisted) {
      await rollback().catch(() => {});
    }
    throw error;
  }
}

function SetupFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-lg px-6 py-10">
        <div className="mb-6">
          <div
            className="pb-2 text-[20px] leading-7 font-bold"
            style={{ color: 'var(--color-text)', borderBottom: 'var(--rule-bar) solid var(--color-text)' }}
          >
            OpenJarvis
          </div>
          <h1 className="tn-page-title mt-5">
            Choose your inference source
          </h1>
          <p className="mt-1 text-[14px] leading-[22px]" style={{ color: 'var(--color-text-secondary)' }}>
            Nothing is installed, started, or downloaded until you confirm a choice.
          </p>
        </div>
        <div className="tn-panel p-5 sm:p-6" style={{ ['--station-fill' as string]: 'var(--color-surface)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SourceOption({
  line,
  title,
  description,
  onClick,
}: {
  line: 'local' | 'none';
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-4 w-full px-3 py-4 text-left cursor-pointer transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ borderRadius: 2 }}
    >
      <Station line={line} className="mt-1" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </span>
        <span className="block text-[13px] leading-5 mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 mt-1" style={{ color: 'var(--color-text-secondary)' }} />
    </button>
  );
}

export function InferenceSourceChooser({
  onChoose,
}: {
  onChoose: (source: 'ollama' | 'custom') => void;
}) {
  return (
    <SetupFrame>
      <ul className="flex flex-col -mx-3 -my-2">
        <li style={{ borderBottom: '1px solid var(--color-border)' }}>
          <SourceOption
            line="local"
            title="Local Ollama"
            description="Run models on this computer. Requires a separate confirmation before Ollama starts or a model downloads."
            onClick={() => onChoose('ollama')}
          />
        </li>
        <li>
          <SourceOption
            line="none"
            title="OpenAI-compatible server"
            description="Connect to LM Studio, vLLM, SGLang, llama.cpp, MLX, or another compatible endpoint. Ollama stays off."
            onClick={() => onChoose('custom')}
          />
        </li>
      </ul>
    </SetupFrame>
  );
}

function BackButton({ onClick, label = 'Back', disabled = false }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tn-btn tn-btn-ghost tn-btn-sm mb-5"
      style={{ marginLeft: -10, color: 'var(--color-text-secondary)' }}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </button>
  );
}

export function InferenceRecoveryButton({
  recovering,
  onChange,
}: {
  recovering: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={recovering}
      className="tn-btn w-full mt-4"
    >
      {recovering ? 'Stopping setup...' : 'Change inference source'}
    </button>
  );
}

export function OllamaConsent({
  onBack,
  onConfirm,
  busy = false,
  error = '',
}: {
  onBack: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <SetupFrame>
      <BackButton onClick={onBack} disabled={busy} />
      <div className="flex items-start gap-3 mb-5">
        <Station line="local" state={busy ? 'current' : 'open'} className="mt-1" />
        <div>
          <h2 className="text-[17px] leading-6 font-bold mb-1" style={{ color: 'var(--color-text)' }}>
            Allow local model setup?
          </h2>
          <p className="text-[14px] leading-[22px]" style={{ color: 'var(--color-text-secondary)' }}>
            OpenJarvis will start Ollama and may download one model selected for this computer. Model downloads can use several gigabytes of disk space and network data.
          </p>
        </div>
      </div>
      <div
        className="flex items-start gap-2.5 py-3 text-[13px] leading-5 mb-5"
        style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <ShieldCheck size={16} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color: 'var(--color-text)' }} />
        Going back leaves Ollama stopped and does not save this choice.
      </div>
      {error && <SetupError message={error} />}
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="tn-btn tn-btn-primary w-full"
        style={{ height: 40 }}
      >
        {busy ? 'Starting local setup...' : 'Use Ollama and continue'}
      </button>
    </SetupFrame>
  );
}

function SetupError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="tn-rule-fail pt-2 text-[14px] leading-[22px] mb-4"
      style={{ color: 'var(--fail)', fontWeight: 500, overflowWrap: 'anywhere' }}
    >
      {message}
    </div>
  );
}

export function CustomEndpointSetup({
  onCancel,
  onConfirm,
  busy = false,
  error = '',
}: {
  onCancel: () => void;
  onConfirm: (source: InferenceSourceSubmission) => void;
  busy?: boolean;
  error?: string;
}) {
  const [host, setHost] = useState('http://localhost:1234/v1');
  const [model, setModel] = useState('');
  const [engine, setEngine] = useState('lmstudio');
  const [apiKey, setApiKey] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm({
      kind: 'custom',
      host: host.trim(),
      model: model.trim(),
      engine,
      apiKey: apiKey.trim() || undefined,
    });
  };

  const labelClass = 'flex flex-col gap-1.5 text-[13px] leading-5 font-medium';
  const labelStyle = { color: 'var(--color-text-secondary)' };

  return (
    <SetupFrame>
      <BackButton onClick={onCancel} label="Cancel" disabled={busy} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Station line="none" state={busy ? 'current' : 'open'} className="mt-1" />
          <div>
            <h2 className="text-[17px] leading-6 font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              Connect your server
            </h2>
            <p className="text-[13px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
              OpenJarvis will connect only after you submit this form. Ollama will not start or download models.
            </p>
          </div>
        </div>
        <label className={labelClass} style={labelStyle}>
          Server URL
          <input
            aria-label="Server URL"
            type="url"
            required
            value={host}
            onChange={(event) => setHost(event.target.value)}
            className="tn-input tn-mono"
          />
        </label>
        <label className={labelClass} style={labelStyle}>
          Model ID
          <input
            aria-label="Model ID"
            type="text"
            required
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="qwen2.5-7b-instruct"
            className="tn-input tn-mono"
          />
        </label>
        <label className={labelClass} style={labelStyle}>
          Server type
          <select
            aria-label="Server type"
            value={engine}
            onChange={(event) => setEngine(event.target.value)}
            className="tn-select"
          >
            <option value="lmstudio">LM Studio</option>
            <option value="vllm">vLLM</option>
            <option value="sglang">SGLang</option>
            <option value="llamacpp">llama.cpp</option>
            <option value="mlx">MLX</option>
          </select>
        </label>
        <label className={labelClass} style={labelStyle}>
          API key (optional)
          <input
            aria-label="API key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            className="tn-input tn-mono"
          />
        </label>
        {error && <SetupError message={error} />}
        <button
          type="submit"
          disabled={busy || !host.trim() || !model.trim()}
          className="tn-btn tn-btn-primary w-full"
          style={{ height: 40 }}
        >
          {busy ? 'Connecting...' : 'Save and connect'}
        </button>
      </form>
    </SetupFrame>
  );
}

export function InferenceSourceSetup({ onStarted }: { onStarted: () => void }) {
  const [step, dispatch] = useReducer(inferenceSetupReducer, 'choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const begin = async (source: InferenceSourceSubmission) => {
    setBusy(true);
    setError('');
    try {
      await persistAndStartInferenceSource(source);
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  if (step === 'ollama') {
    return (
      <OllamaConsent
        busy={busy}
        error={error}
        onBack={() => dispatch('back')}
        onConfirm={() => void begin({ kind: 'ollama' })}
      />
    );
  }
  if (step === 'custom') {
    return (
      <CustomEndpointSetup
        busy={busy}
        error={error}
        onCancel={() => dispatch('back')}
        onConfirm={(source) => void begin(source)}
      />
    );
  }
  return (
    <InferenceSourceChooser
      onChoose={(source) => dispatch(source === 'ollama' ? 'choose_ollama' : 'choose_custom')}
    />
  );
}
