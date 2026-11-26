import type { ReactNode } from 'react';

export type StatusTone = 'default' | 'muted' | 'fail';

interface StatusTextProps {
  children: ReactNode;
  /** default = secondary text, muted = tertiary, fail = red (failures only). */
  tone?: StatusTone;
  mono?: boolean;
  className?: string;
}

const TONE_COLOR: Record<StatusTone, string> = {
  default: 'var(--color-text-secondary)',
  muted: 'var(--color-text-tertiary)',
  fail: 'var(--fail)',
};

/** Status as words, never as a coloured pill. */
export function StatusText({ children, tone = 'default', mono = true, className = '' }: StatusTextProps) {
  return (
    <span
      className={`${mono ? 'tn-mono' : ''} text-[12px] ${className}`}
      style={{ color: TONE_COLOR[tone], fontWeight: tone === 'fail' ? 500 : 400 }}
    >
      {children}
    </span>
  );
}
