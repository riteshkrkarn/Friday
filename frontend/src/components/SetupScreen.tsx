import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSetupStatus,
  fetchModels,
  fetchRecommendedModel,
  resetInferenceSource,
  type SetupStatus,
} from '../lib/api';
import { useAppStore } from '../lib/store';
import { isEmbedOnlyModel } from '../lib/model-capabilities';
import { InferenceRecoveryButton, InferenceSourceSetup } from './InferenceSourceSetup';

const STEPS = [
  { key: 'ollama_ready', label: 'Inference Engine', detail: 'Starting Ollama...' },
  { key: 'model_ready', label: 'AI Model', detail: 'Loading model...' },
  { key: 'server_ready', label: 'API Server', detail: 'Starting server...' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

/** Row height; the station sits centred on the label line. */
const ROW_H = 64;
const STATION = 22;

/**
 * One station on the vertical setup line. done = filled in the line colour,
 * current = filled with an action-blue ring, failed = red, waiting = open.
 */
function StepRow({
  label,
  done,
  active,
  failed,
  detail,
  line,
  first,
  last,
}: {
  label: string;
  done: boolean;
  active: boolean;
  failed: boolean;
  detail: string;
  /** CSS colour of this line (local green for Ollama, neutral for a custom server). */
  line: string;
  first: boolean;
  last: boolean;
}) {
  const stroke = failed ? 'var(--fail)' : done || active ? line : 'var(--line-none)';
  const fill = failed || done || active ? stroke : 'var(--color-bg)';
  const status = done ? 'Ready' : active ? detail : 'Waiting...';
  const mid = STATION / 2;
  return (
    <li
      className="relative flex items-center gap-4"
      style={{ minHeight: ROW_H, paddingLeft: STATION + 16 }}
      aria-current={active ? 'step' : undefined}
    >
      {!first && (
        <span aria-hidden="true" className="absolute" style={{ left: mid - 2.5, width: 5, top: 0, height: '50%', background: done || active || failed ? line : 'var(--color-border)' }} />
      )}
      {!last && (
        <span aria-hidden="true" className="absolute" style={{ left: mid - 2.5, width: 5, top: '50%', bottom: 0, background: done ? line : 'var(--color-border)' }} />
      )}
      <svg
        width={STATION}
        height={STATION}
        viewBox={`0 0 ${STATION} ${STATION}`}
        aria-hidden="true"
        className="absolute z-[1]"
        style={{ left: 0, top: `calc(50% - ${mid}px)` }}
      >
        {active && !failed && (
          <circle cx={mid} cy={mid} r={mid - 1} strokeWidth={2} style={{ stroke: 'var(--action)', fill: 'var(--color-bg)' }} />
        )}
        <circle
          cx={mid}
          cy={mid}
          r={5.5}
          strokeWidth={3}
          style={{ stroke, fill, transition: 'fill 160ms ease-out, stroke 160ms ease-out' }}
        />
      </svg>
      <div className="flex-1 min-w-0 py-2">
        <div className="text-[15px] leading-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {label}
        </div>
        <div
          className="text-[13px] leading-5 truncate"
          style={{ color: active || failed ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}
        >
          {status}
        </div>
      </div>
    </li>
  );
}

export function SetupScreen({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [setupInitiated, setSetupInitiated] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const handedOffRef = useRef(false);
  const poll = useCallback(async () => {
    const s = await getSetupStatus();
    if (s) setStatus(s);
    setStatusChecked(true);
    if (s?.phase === 'ready' && !handedOffRef.current) {
      handedOffRef.current = true;
      // Pre-select a model BEFORE handing off so the chat is usable on
      // first send. Without this, the main app's post-mount fetch can
      // lose a race to a fast first message and Ollama 400s.
      try {
        const [models, rec] = await Promise.all([
          fetchModels().catch(() => []),
          fetchRecommendedModel().catch(() => ({ model: '', reason: '' })),
        ]);
        const store = useAppStore.getState();
        const hadSelection = !!store.selectedModel;
        store.setModels(models);
        store.setModelsLoading(false);
        const chatModels = models.filter((m) => !isEmbedOnlyModel(m.id));
        const recommended = rec.model && chatModels.some((m) => m.id === rec.model)
          ? rec.model
          : chatModels[0]?.id || '';
        if (recommended && !hadSelection) {
          store.setSelectedModel(recommended);
        }
      } catch {
        // Non-fatal: store.setModels auto-selects on later fetch, and
        // the InputArea guards the empty-model case with a toast.
      }
      setTimeout(() => onReady(), 600);
    }
  }, [onReady]);

  const changeInferenceSource = useCallback(async () => {
    setRecovering(true);
    setRecoveryError('');
    try {
      await resetInferenceSource();
      handedOffRef.current = false;
      setSetupInitiated(false);
      setStatus(null);
      await poll();
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecovering(false);
    }
  }, [poll]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 800);
    return () => clearInterval(interval);
  }, [poll]);

  if (statusChecked && status?.requires_source && !setupInitiated) {
    return (
      <InferenceSourceSetup
        onStarted={() => {
          setSetupInitiated(true);
          void poll();
        }}
      />
    );
  }

  const activeStep: StepKey | null =
    status && !status.ollama_ready
      ? 'ollama_ready'
      : status && !status.model_ready
        ? 'model_ready'
        : status && !status.server_ready
          ? 'server_ready'
          : null;

  const isCustom = status?.source === 'custom';
  const lineColor = isCustom ? 'var(--line-none)' : 'var(--line-local)';
  const steps = isCustom
    ? [
        { key: 'ollama_ready' as const, label: 'Inference Engine', detail: 'Connecting to your server...' },
        { key: 'model_ready' as const, label: 'Endpoint', detail: 'Checking endpoint...' },
        { key: 'server_ready' as const, label: 'API Server', detail: 'Starting server...' },
      ]
    : STEPS;
  const readyCount =
    (status?.ollama_ready ? 1 : 0) + (status?.model_ready ? 1 : 0) + (status?.server_ready ? 1 : 0);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-md px-6 py-10">
        {/* Wordmark */}
        <div className="mb-8">
          <h1
            className="pb-3 text-[28px] leading-8 font-bold"
            style={{ color: 'var(--color-text)', borderBottom: 'var(--rule-bar) solid var(--color-text)' }}
          >
            OpenJarvis
          </h1>
          <p className="mt-3 text-[15px] leading-[22px]" style={{ color: 'var(--color-text-secondary)' }}>
            {!statusChecked
              ? 'Checking your saved setup...'
              : isCustom
                ? 'Connecting to your AI server...'
                : 'Setting up your local AI...'}
          </p>
        </div>

        {/* Steps: stations on one line */}
        <ol className="flex flex-col mb-6" aria-label="Setup progress">
          {steps.map((step, i) => (
            <StepRow
              key={step.key}
              label={step.label}
              done={status?.[step.key] ?? false}
              active={activeStep === step.key}
              failed={!!status?.error && activeStep === step.key}
              line={lineColor}
              first={i === 0}
              last={i === steps.length - 1}
              detail={
                activeStep === step.key && status?.detail
                  ? status.detail
                  : step.detail
              }
            />
          ))}
        </ol>

        {/* Error */}
        {status?.error && (
          <div
            className="tn-panel tn-rule-fail px-4 py-3 text-[14px] leading-[22px]"
            style={{ color: 'var(--fail)', fontWeight: 500 }}
          >
            <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{status.error}</span>
          </div>
        )}

        {recoveryError && (
          <div
            role="alert"
            className="tn-rule-fail mt-3 pt-2 text-[14px] leading-[22px]"
            style={{ color: 'var(--fail)', fontWeight: 500, overflowWrap: 'anywhere' }}
          >
            {recoveryError}
          </div>
        )}

        {/* Progress: a 5px line that fills as each station is reached */}
        {!status?.error && (
          <div aria-hidden="true" style={{ height: 5, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: '100%',
                background: lineColor,
                transform: `scaleX(${readyCount / 3})`,
                transformOrigin: 'left center',
                transition: 'transform 200ms ease-out',
              }}
            />
          </div>
        )}

        {statusChecked && status && !status.requires_source && status.phase !== 'ready' && (
          <InferenceRecoveryButton
            recovering={recovering}
            onChange={() => void changeInferenceSource()}
          />
        )}
      </div>
    </div>
  );
}
