import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { getBase, authHeaders } from '../../lib/api';
import { lineForModel, type Line, type RouteStop } from '../../lib/transit-lines';
import { RouteStrip, SectionHeading, Station } from '../transit';

interface TraceStepData {
  model?: string;
  tokens?: number;
  tool?: string;
  input?: string;
  output?: string;
  [key: string]: unknown;
}

interface TraceStep {
  step_type: string;
  duration_ms: number;
  data: TraceStepData;
}

interface TraceSummary {
  id: string;
  query: string;
  steps: TraceStep[];
  created_at: string;
}

/**
 * Which line a trace step runs on: tool steps on the tools line, retrieval
 * and memory steps on the data line, generation by its model when known.
 */
function lineForStep(step: TraceStep): Line {
  const type = step.step_type.toLowerCase();
  if (type.includes('tool')) return 'tools';
  if (type.includes('retriev') || type.includes('memory')) return 'data';
  if (type.includes('generat')) {
    const model = typeof step.data?.model === 'string' ? step.data.model : '';
    return model ? lineForModel(model) : 'none';
  }
  return 'none';
}

function stringify(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stopsForTrace(trace: TraceSummary): RouteStop[] {
  return trace.steps.map((step, i) => ({
    id: `${trace.id}-${i}`,
    kind: step.step_type.toLowerCase().includes('tool') ? 'tool' : 'engine',
    line: lineForStep(step),
    label: step.step_type,
    detail: `${step.duration_ms.toFixed(0)}ms`,
    rows: Object.entries(step.data ?? {})
      .filter(([, v]) => v != null)
      .slice(0, 6)
      .map(([key, value]) => ({ label: key, value: clip(stringify(value)) })),
  }));
}

function TraceCard({ trace, isActive, onClick }: { trace: TraceSummary; isActive: boolean; onClick: () => void }) {
  const totalMs = trace.steps.reduce((sum, s) => sum + s.duration_ms, 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--color-bg-tertiary)]"
      style={{
        borderBottom: '1px solid var(--color-border)',
        background: isActive ? 'var(--color-accent-subtle)' : undefined,
      }}
    >
      <div
        className="text-[14px] truncate mb-0.5"
        style={{ color: 'var(--color-text)', fontWeight: isActive ? 700 : 400 }}
      >
        {trace.query || 'Untitled query'}
      </div>
      <div className="tn-mono flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>{trace.steps.length} steps</span>
        <span aria-hidden="true">·</span>
        <span>{totalMs.toFixed(0)}ms</span>
        <span aria-hidden="true">·</span>
        <span>{new Date(trace.created_at).toLocaleTimeString()}</span>
      </div>
    </button>
  );
}

function StepDetail({ step, index }: { step: TraceStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const dataEntries = Object.entries(step.data).filter(([_, v]) => v != null);

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-3 w-full px-1 py-2.5 text-[14px] cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--color-bg-tertiary)]"
      >
        {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        <span className="tn-mono text-[12px] w-5 text-right" style={{ color: 'var(--color-text-tertiary)' }}>
          {index + 1}
        </span>
        <Station line={lineForStep(step)} size={12} />
        <span className="tn-mono" style={{ color: 'var(--color-text)' }}>{step.step_type}</span>
        <span className="flex-1" />
        <span className="tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {step.duration_ms.toFixed(0)}ms
        </span>
      </button>
      {expanded && dataEntries.length > 0 && (
        <dl className="pl-[60px] pr-1 pb-3 text-[13px]">
          {dataEntries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-1">
              <dt className="tn-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                {key}
              </dt>
              <dd className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function TraceDebugger() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    try {
      const base = getBase();
      const res = await fetch(`${base}/v1/traces?limit=50`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTraces(data.traces || []);
      setError(null);
    } catch {
      setError('Cannot load traces');
    }
  }, []);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const selected = traces.find((t) => t.id === selectedId);

  if (error) {
    return (
      <section aria-labelledby="overview-traces">
        <SectionHeading as="h2" id="overview-traces">Trace Debugger</SectionHeading>
        <div className="h-48 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <Station line="none" state="failed" size={12} />
          <span className="tn-mono text-[13px]" style={{ color: 'var(--fail)' }}>{error}</span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="overview-traces">
      <SectionHeading as="h2" id="overview-traces">Trace Debugger</SectionHeading>

      {traces.length === 0 ? (
        <div className="h-48 flex items-center text-[14px]" style={{ color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
          No traces yet. Start making queries to see them here.
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:h-[28rem]">
          {/* Trace list */}
          <div
            className="lg:w-[36%] max-h-72 lg:max-h-none overflow-y-auto flex flex-col shrink-0 lg:border-r"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {traces.map((trace) => (
              <TraceCard
                key={trace.id}
                trace={trace}
                isActive={trace.id === selectedId}
                onClick={() => setSelectedId(trace.id)}
              />
            ))}
          </div>

          {/* Trace detail */}
          <div className="flex-1 min-w-0 overflow-y-auto pt-5 lg:pt-3 lg:pl-6">
            {selected ? (
              <div className="flex flex-col">
                <div className="text-[16px] font-bold mb-4" style={{ color: 'var(--color-text)' }}>
                  {selected.query}
                </div>
                <RouteStrip stops={stopsForTrace(selected)} label="Trace route" className="mb-5" />
                <div style={{ borderTop: '2px solid var(--color-text)' }}>
                  {selected.steps.map((step, i) => (
                    <StepDetail key={i} step={step} index={i} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-24 flex items-center justify-center text-[14px]" style={{ color: 'var(--color-text-tertiary)' }}>
                Select a trace to view details
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
