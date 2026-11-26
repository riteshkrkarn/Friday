import type { ReactNode } from 'react';

export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <kbd className={`tn-kbd ${className}`}>{children}</kbd>;
}
