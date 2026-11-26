import type { CSSProperties } from 'react';
import { lineColor, type RouteStop } from '../../lib/transit-lines';
import { Station } from './Station';

interface RouteStripProps {
  stops: RouteStop[];
  /** The reply is still streaming: the last station is the filled head. */
  live?: boolean;
  label?: string;
  className?: string;
}

function summary(stop: RouteStop): string {
  const parts = [stop.label];
  if (stop.detail) parts.push(stop.detail);
  for (const row of stop.rows ?? []) parts.push(`${row.label} ${row.value}`);
  return parts.join(', ');
}

/**
 * Horizontal stations joined by 5px segments. Each segment takes the colour
 * of the station it leads into and draws from the left on mount. Hovering or
 * focusing a station shows its figures inline (no portal).
 */
export function RouteStrip({ stops, live = false, label = 'Route', className = '' }: RouteStripProps) {
  if (stops.length === 0) return null;
  return (
    <ol className={`tn-route ${className}`} aria-label={label} aria-busy={live || undefined}>
      {stops.map((stop, i) => {
        const next = stops[i + 1];
        const isLast = i === stops.length - 1;
        const state = stop.state ?? (live && isLast ? 'current' : 'open');
        const mono = stop.kind !== 'device' && stop.kind !== 'terminal';
        const segStyle = { background: lineColor(next?.line ?? stop.line), '--i': live ? 0 : i } as CSSProperties;
        return (
          <li key={stop.id} className="tn-route-stop">
            <button type="button" className="tn-route-btn w-full" aria-label={summary(stop)}>
              <span className="tn-route-track w-full">
                <Station line={stop.line} state={state} className="relative z-[1]" />
                {next && <span aria-hidden="true" className="tn-seg" style={segStyle} />}
              </span>
              <span aria-hidden="true" className={`tn-route-label ${mono ? 'tn-mono' : ''}`}>
                {stop.label}
              </span>
              {stop.detail && (
                <span
                  aria-hidden="true"
                  className="tn-route-label tn-mono"
                  style={{ fontSize: 11, color: stop.state === 'failed' ? 'var(--fail)' : 'var(--color-text-tertiary)' }}
                >
                  {stop.detail}
                </span>
              )}
            </button>
            {stop.rows && stop.rows.length > 0 && (
              <div className="tn-route-pop" aria-hidden="true">
                <dl className="tn-figures">
                  {stop.rows.map((row) => (
                    <div key={row.label} className="contents">
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
