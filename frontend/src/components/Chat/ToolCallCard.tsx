import { useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ToolCallInfo } from '../../types';
import { serializeToolCallArguments } from '../../lib/tool-call';
import { formatMs, type StationState } from '../../lib/transit-lines';
import { Station, StatusText } from '../transit';

interface Props {
  toolCall: ToolCallInfo;
}

const STATION_STATE: Record<ToolCallInfo['status'], StationState> = {
  running: 'current',
  success: 'open',
  error: 'failed',
};

function previewArgs(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const entries = Object.entries(parsed);
      if (entries.length === 0) return '';
      const [k, v] = entries[0];
      const valStr =
        typeof v === 'string' ? v : JSON.stringify(v);
      const trimmed = valStr.length > 40 ? `${valStr.slice(0, 40)}…` : valStr;
      return entries.length === 1 ? `${k}: ${trimmed}` : `${k}: ${trimmed}, …`;
    }
  } catch {
    /* fall through */
  }
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
}

const blockLabel: CSSProperties = {
  color: 'var(--color-text-tertiary)',
  fontSize: 11,
  lineHeight: '16px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

const blockPre: CSSProperties = {
  background: 'var(--color-code-bg)',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 2,
  fontSize: 12,
  lineHeight: '18px',
  whiteSpace: 'pre-wrap',
};

export function ToolCallCard({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isError = toolCall.status === 'error';

  // Persisted conversations may contain the pre-fix object payload despite
  // the TypeScript contract, so normalize again at the final render boundary.
  const argumentsText = serializeToolCallArguments(toolCall.arguments);
  const preview = previewArgs(argumentsText);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className="tn-panel text-[13px]"
      style={{ '--station-fill': 'var(--color-surface)' } as CSSProperties}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2.5 w-full min-h-9 px-3 py-1.5 cursor-pointer text-left"
      >
        <Station line="tools" state={STATION_STATE[toolCall.status]} />
        <span className="tn-mono shrink-0" style={{ color: 'var(--color-text)', fontWeight: 500 }}>
          {toolCall.tool}
        </span>
        {preview && !expanded && (
          <span className="tn-mono truncate min-w-0 text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {preview}
          </span>
        )}
        <span className="flex-1" />
        <StatusText tone={isError ? 'fail' : 'default'} className="shrink-0">
          {toolCall.status}
        </StatusText>
        {toolCall.latency != null && (
          <StatusText tone="muted" className="shrink-0">
            {formatMs(toolCall.latency)}
          </StatusText>
        )}
        <Chevron size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
      </button>

      {expanded && (
        <div
          className="px-3 pb-3 pt-2 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {argumentsText && (
            <div>
              <div style={blockLabel}>args</div>
              <pre className="tn-mono p-2 overflow-auto" style={{ ...blockPre, maxHeight: 120, wordBreak: 'break-all' }}>
                {formatJson(argumentsText)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div style={blockLabel}>result</div>
              <pre
                className="tn-mono p-2 overflow-auto"
                style={{
                  ...blockPre,
                  maxHeight: 180,
                  wordBreak: 'break-word',
                  color: isError ? 'var(--fail)' : blockPre.color,
                }}
              >
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
