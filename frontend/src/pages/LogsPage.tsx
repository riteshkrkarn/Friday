import { useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { PageHeader, Station } from '../components/transit';

const LEVEL_STYLE: Record<string, CSSProperties> = {
  info: { color: 'var(--color-text-tertiary)' },
  warn: { color: 'var(--color-text)', fontWeight: 600 },
  error: { color: 'var(--fail)', fontWeight: 600 },
};

const ROW_GRID = 'grid grid-cols-[64px_48px_minmax(0,1fr)] sm:grid-cols-[72px_56px_96px_minmax(0,1fr)] gap-x-3';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Category({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
      {category === 'tool' && <Station line="tools" size={10} />}
      <span className="truncate">{category}</span>
    </span>
  );
}

export function LogsPage() {
  const logEntries = useAppStore((s) => s.logEntries);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logEntries.length]);

  const handleCopy = async () => {
    const text = logEntries
      .map((e) => `${formatTime(e.timestamp)} [${e.level}] [${e.category}] ${e.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-8 py-8">
      <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 overflow-hidden">
        <div className="shrink-0 mb-5">
          <PageHeader
            title="Activity Logs"
            meta={`${logEntries.length} entries`}
            actions={
              <>
                <button onClick={handleCopy} className="tn-btn tn-btn-sm">
                  <Copy size={13} /> Copy All
                </button>
                <button onClick={clearLogs} className="tn-btn tn-btn-sm">
                  <Trash2 size={13} /> Clear
                </button>
              </>
            }
          />
          <p className="text-[14px] mt-3 max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
            Recent activity — chat events, model switches, tool calls, and system messages from this session.
          </p>
        </div>

        {/* Log entries */}
        <div
          className="flex-1 overflow-y-auto tn-mono text-[12px] leading-[18px]"
          style={{
            background: 'var(--color-code-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            '--station-fill': 'var(--color-code-bg)',
          } as CSSProperties}
        >
          {logEntries.length === 0 ? (
            <div className="font-sans text-[14px] leading-5 text-center px-6 py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              No log entries yet. Logs appear as you chat, switch models, and interact with the app.
            </div>
          ) : (
            <div role="table" aria-label="Activity log" className="min-w-0">
              <div
                role="row"
                className={`${ROW_GRID} sticky top-0 z-[1] px-4 py-2 font-sans text-[11px] leading-4 font-bold uppercase tracking-[0.06em]`}
                style={{ background: 'var(--color-code-bg)', borderBottom: '2px solid var(--color-text)', color: 'var(--color-text-secondary)' }}
              >
                <span role="columnheader">Time</span>
                <span role="columnheader">Level</span>
                <span role="columnheader" className="hidden sm:block">Category</span>
                <span role="columnheader">Message</span>
              </div>
              {logEntries.map((entry, i) => (
                <div
                  key={i}
                  role="row"
                  className={`${ROW_GRID} px-4 py-1.5`}
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                >
                  <span role="cell" style={{ color: 'var(--color-text-tertiary)' }}>{formatTime(entry.timestamp)}</span>
                  <span role="cell" style={LEVEL_STYLE[entry.level] || LEVEL_STYLE.info}>{entry.level.toUpperCase()}</span>
                  <span role="cell" className="hidden sm:flex min-w-0">
                    <Category category={entry.category} />
                  </span>
                  <span
                    role="cell"
                    className="min-w-0 break-words whitespace-pre-wrap"
                    style={{ color: entry.level === 'error' ? 'var(--fail)' : 'var(--color-text)' }}
                  >
                    <span className="sm:hidden mr-2"><Category category={entry.category} /></span>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
