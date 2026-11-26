import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ResearchSearchTrace, TimeRange } from '../../types';
import type { StationState } from '../../lib/transit-lines';
import { Station } from '../transit';

interface Props {
  traces: ResearchSearchTrace[];
  isLive: boolean;
  hasContent: boolean;
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function fmtDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return SHORT_DATE.format(d);
}

function formatTimeRange(tr: TimeRange | string | undefined): string | null {
  if (!tr) return null;
  if (typeof tr === 'string') return tr.trim() || null;
  const start = tr.start ? fmtDate(tr.start) : null;
  const end = tr.end ? fmtDate(tr.end) : null;
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `after ${start}`;
  if (end) return `before ${end}`;
  return null;
}

function summarizeTraces(traces: ResearchSearchTrace[]): string {
  const n = traces.length;
  const hits = traces.reduce((s, t) => s + (t.numHits ?? 0), 0);
  const searchLabel = `${n} ${n === 1 ? 'search' : 'searches'}`;
  if (hits === 0) return searchLabel;
  return `${searchLabel} · ${hits} ${hits === 1 ? 'result' : 'results'}`;
}

/**
 * One station on the vertical data line. The rail runs from this station's
 * centre down to the next one; the station sits on top of it.
 */
function LineStop({
  state,
  last,
  children,
}: {
  state: StationState;
  last: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative pl-7">
      {!last && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{ left: 4.5, top: 10, bottom: -22, width: 5, background: 'var(--line-data)' }}
        />
      )}
      <Station line="data" state={state} className="absolute left-0 top-[3px] z-[1]" />
      {children}
    </li>
  );
}

function StatusLine({ text }: { text: string }) {
  return (
    <div className="text-[13px] leading-[22px]" style={{ color: 'var(--color-text-secondary)' }}>
      {text}…
    </div>
  );
}

function TimelineStep({
  index,
  trace,
  isLive,
  last,
}: {
  index: number;
  trace: ResearchSearchTrace;
  isLive: boolean;
  last: boolean;
}) {
  const pending = trace.status === 'pending';
  const active = pending && isLive;

  const meta: string[] = [];
  if (trace.person) meta.push(`person: ${trace.person}`);
  const formattedTime = formatTimeRange(trace.timeRange);
  if (formattedTime) meta.push(`time: ${formattedTime}`);

  return (
    <LineStop state={pending ? 'unavailable' : 'open'} last={last}>
      <div
        className="text-[11px] leading-4 uppercase tracking-[0.06em] mb-0.5 font-bold"
        style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
      >
        Search {index}
      </div>
      <div className="text-[14px] leading-5" style={{ color: 'var(--color-text)', fontWeight: 500 }}>
        “{trace.query}”
      </div>
      {meta.length > 0 && (
        <div className="tn-mono text-[12px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          {meta.join(' · ')}
        </div>
      )}
      {!active && trace.numHits != null && (
        <div className="tn-mono text-[12px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {trace.numHits} {trace.numHits === 1 ? 'result' : 'results'}
        </div>
      )}
      {trace.topTitles && trace.topTitles.length > 0 && (
        <div className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
          {trace.topTitles.slice(0, 2).join(' · ')}
        </div>
      )}
    </LineStop>
  );
}

const stationFill = { '--station-fill': 'var(--color-bg)' } as CSSProperties;

export function ResearchTimeline({ traces, isLive, hasContent }: Props) {
  const showAnalyzing = isLive && traces.length === 0 && !hasContent;
  const allComplete =
    traces.length > 0 && traces.every((t) => t.status === 'complete');
  const showSynthesizing = isLive && allComplete && !hasContent;

  // Auto-collapse the timeline the moment synthesis text begins streaming.
  // Subsequent user toggles win — we only fire the auto-collapse once per
  // false→true transition of hasContent.
  const [expanded, setExpanded] = useState(true);
  const prevHasContent = useRef(false);
  useEffect(() => {
    if (hasContent && !prevHasContent.current) {
      setExpanded(false);
    }
    prevHasContent.current = hasContent;
  }, [hasContent]);

  if (!showAnalyzing && traces.length === 0) return null;

  // No collapse affordance before any traces have arrived — just the
  // analyzing status sitting alone.
  if (traces.length === 0) {
    return (
      <ol className="mb-4" style={stationFill}>
        <LineStop state="unavailable" last>
          <StatusLine text="Analyzing query" />
        </LineStop>
      </ol>
    );
  }

  const summary = summarizeTraces(traces);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <div className="mb-4" style={stationFill}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="tn-mono inline-flex items-center gap-2 h-7 text-[12px] mb-2 cursor-pointer"
        style={{ color: 'var(--color-text-secondary)' }}
        title={expanded ? 'Collapse search trace' : 'Expand search trace'}
      >
        <span>{summary}</span>
        <Chevron size={14} />
      </button>

      {expanded && (
        <ol className="flex flex-col gap-3">
          {traces.map((t, i) => (
            <TimelineStep
              key={t.id}
              index={i + 1}
              trace={t}
              isLive={isLive}
              last={i === traces.length - 1 && !showSynthesizing}
            />
          ))}
          {showSynthesizing && (
            <LineStop state="unavailable" last>
              <StatusLine text="Synthesizing findings" />
            </LineStop>
          )}
        </ol>
      )}
    </div>
  );
}
