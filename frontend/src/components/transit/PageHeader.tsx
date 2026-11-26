import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  /** Mono line under the title: counts, ids, values. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** 24px/700 page title, optional mono meta, actions at the right. */
export function PageHeader({ title, meta, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={`tn-page-header ${className}`}>
      <div className="min-w-0">
        <h1 className="tn-page-title">{title}</h1>
        {meta != null && (
          <p className="tn-mono text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {meta}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  );
}
