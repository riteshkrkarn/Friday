import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { approveAction, denyAction, fetchPendingApprovals } from '../lib/api';
import type { PendingApproval } from '../lib/api';

const TIER_LABELS: Record<string, string> = {
  trivial: 'Trivial',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ApprovalBell({ inline = false }: { inline?: boolean } = {}) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setApprovals(await fetchPendingApprovals());
    } catch {
      // backend may not be running yet
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleApprove = async (id: string) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      await approveAction(id);
      setApprovals(prev => prev.filter(a => a.id !== id));
    } finally {
      setProcessing(p => ({ ...p, [id]: false }));
    }
  };

  const handleDeny = async (id: string) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      await denyAction(id);
      setApprovals(prev => prev.filter(a => a.id !== id));
    } finally {
      setProcessing(p => ({ ...p, [id]: false }));
    }
  };

  const count = approvals.length;

  return (
    <div ref={containerRef} className={inline ? 'relative' : 'fixed top-3 right-3 z-40'}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="tn-icon-btn relative"
        title="Agent approvals"
        aria-expanded={open}
        style={count > 0 ? { color: 'var(--color-text)' } : undefined}
      >
        <Bell size={17} />
        {count > 0 && (
          <span
            className="tn-mono absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-[2px] text-[10px] font-bold leading-none"
            style={{ background: 'var(--color-text)', color: 'var(--color-bg)' }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="tn-panel tn-rule-top absolute right-0 top-full mt-2 overflow-hidden flex flex-col z-40"
          style={{ width: 'min(360px, calc(100vw - 24px))', maxHeight: '500px' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span className="text-[14px] font-bold" style={{ color: 'var(--color-text)' }}>
              Agent Approvals
            </span>
            {count > 0 && (
              <span className="tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {count} pending
              </span>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {count === 0 ? (
              <div className="px-4 py-8 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                No pending approvals
              </div>
            ) : (
              approvals.map((action, idx) => {
                const tierLabel = TIER_LABELS[action.tier] ?? TIER_LABELS.medium;
                const isExpanded = !!expanded[action.id];
                const isLoading = !!processing[action.id];
                const hasPayload = Object.keys(action.payload ?? {}).length > 0;

                return (
                  <div
                    key={action.id}
                    className="px-4 py-3"
                    style={{
                      borderBottom: idx < count - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                  >
                    {/* Row 1: action type + tier + time */}
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="tn-mono text-[12px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {action.action_type}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className="text-[11px] uppercase tracking-[0.06em]"
                          style={{
                            color: action.tier === 'high' ? 'var(--color-text)' : 'var(--color-text-secondary)',
                            fontWeight: action.tier === 'high' ? 700 : 500,
                          }}
                        >
                          {tierLabel}
                        </span>
                        <span className="tn-mono text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {timeAgo(action.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-[14px] leading-5 mb-2.5" style={{ color: 'var(--color-text)' }}>
                      {action.description}
                    </p>

                    {/* Expandable payload */}
                    {hasPayload && (
                      <button
                        className="flex items-center gap-1 text-[12px] mb-2 cursor-pointer rounded-[2px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpanded(e => ({ ...e, [action.id]: !e[action.id] }))
                        }
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    )}

                    {isExpanded && (
                      <pre
                        className="tn-mono text-[11px] leading-[16px] rounded-[2px] p-2.5 mb-2.5 overflow-x-auto"
                        style={{
                          background: 'var(--color-code-bg)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-secondary)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {JSON.stringify(action.payload, null, 2)}
                      </pre>
                    )}

                    {/* Approve / Deny */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(action.id)}
                        disabled={isLoading}
                        className="tn-btn tn-btn-primary tn-btn-sm flex-1"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDeny(action.id)}
                        disabled={isLoading}
                        className="tn-btn tn-btn-danger tn-btn-sm flex-1"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
