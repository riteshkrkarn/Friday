import type { ReactNode } from 'react';

interface SectionHeadingProps {
  children: ReactNode;
  as?: 'h2' | 'h3' | 'h4';
  id?: string;
  /** Controls at the right of the heading, in normal case. */
  actions?: ReactNode;
  className?: string;
}

/** A 4px rule bar over a 13px/700 uppercase label. */
export function SectionHeading({ children, as: Tag = 'h3', id, actions, className = '' }: SectionHeadingProps) {
  return (
    <div className={`tn-heading flex items-center justify-between gap-3 ${className}`}>
      <Tag id={id} className="min-w-0 truncate">
        {children}
      </Tag>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 normal-case tracking-normal font-normal text-[13px]">
          {actions}
        </div>
      )}
    </div>
  );
}
