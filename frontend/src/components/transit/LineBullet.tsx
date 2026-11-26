import { lineColor, type Line } from '../../lib/transit-lines';

/** Letter ink that reads on each line colour in both themes. */
const INK_ON_LINE: Record<Line, string> = {
  local: '#ffffff',
  cloud: '#111111',
  tools: '#111111',
  data: '#ffffff',
  none: '#ffffff',
};

interface LineBulletProps {
  letter: string;
  /** Colour the bullet by engine family. Without it the bullet takes --bullet-fill. */
  line?: Line;
  size?: number;
  className?: string;
}

/**
 * A letter in a filled circle. Decorative: the row it sits in carries the
 * accessible name. Without `line`, the circle takes `--bullet-fill` and the
 * letter `--bullet-ink` (both set by the row), so it inverts with its row.
 */
export function LineBullet({ letter, line, size = 20, className = '' }: LineBulletProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid place-items-center shrink-0 rounded-full select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: line ? lineColor(line) : 'var(--bullet-fill, var(--color-text))',
        color: line ? INK_ON_LINE[line] : 'var(--bullet-ink, var(--color-bg))',
        font: `700 ${Math.round(size * 0.55)}px/1 var(--font-display)`,
      }}
    >
      {letter}
    </span>
  );
}
