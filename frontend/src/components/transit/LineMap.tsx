import type { ReactNode } from 'react';
import { lineColor, type Line, type StationState } from '../../lib/transit-lines';
import { Station } from './Station';

export interface LineMapItem {
  id: string;
  line: Line;
  label: ReactNode;
  /** Right-aligned status, e.g. "running", "ok · 0.6s", "404". */
  status?: ReactNode;
  state?: StationState;
}

interface LineMapProps {
  items: LineMapItem[];
  label?: string;
  className?: string;
}

/** Vertical stations on a 5px line; each half-rail takes its own station's colour. */
export function LineMap({ items, label, className = '' }: LineMapProps) {
  if (items.length === 0) return null;
  return (
    <ul className={`tn-linemap ${className}`} aria-label={label}>
      {items.map((item, i) => (
        <li key={item.id} className="tn-linemap-item">
          {i > 0 && (
            <span aria-hidden="true" className="tn-linemap-rail" data-half="top" style={{ background: lineColor(item.line) }} />
          )}
          {i < items.length - 1 && (
            <span aria-hidden="true" className="tn-linemap-rail" data-half="bottom" style={{ background: lineColor(item.line) }} />
          )}
          <Station line={item.line} state={item.state} className="relative z-[1]" />
          <span className="flex-1 min-w-0 truncate">{item.label}</span>
          {item.status != null && (
            <span
              className="tn-mono shrink-0 text-[12px]"
              style={{
                color: item.state === 'failed' ? 'var(--fail)' : 'var(--color-text-secondary)',
                fontWeight: item.state === 'failed' ? 500 : 400,
              }}
            >
              {item.status}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
