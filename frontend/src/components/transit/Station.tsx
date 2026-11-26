import { lineColor, type Line, type StationState } from '../../lib/transit-lines';

interface StationProps {
  line: Line;
  /** open (default), current (filled), unavailable (dashed grey), failed (red). */
  state?: StationState;
  size?: number;
  /** Accessible name. Omit when adjacent text already names the station. */
  label?: string;
  className?: string;
}

/**
 * An open circle stroked in its line colour. The inside takes
 * `--station-fill` (default: the page ground) so it reads as open on any
 * surface that sets it.
 */
export function Station({ line, state = 'open', size = 14, label, className = '' }: StationProps) {
  const stroke =
    state === 'failed'
      ? 'var(--fail)'
      : state === 'unavailable'
        ? 'var(--line-none)'
        : lineColor(line);
  const strokeWidth = size >= 12 ? 3 : 2;
  const r = (size - strokeWidth) / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={strokeWidth}
        strokeDasharray={state === 'unavailable' ? '2.4 2' : undefined}
        style={{
          stroke,
          fill: state === 'current' ? stroke : 'var(--station-fill, var(--color-bg))',
          transition: 'fill 160ms ease-out, stroke 160ms ease-out',
        }}
      />
    </svg>
  );
}
