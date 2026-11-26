import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Mic, Plus, Check, X, MessageSquare, ArrowUpRight, Search, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { Kbd, LineBullet, SectionHeading, StatusText } from '../components/transit';

type ItemType = 'hackathon' | 'project' | 'task' | 'achievement';
type ItemStatus = 'open' | 'done';

interface FridayItem {
  id: string;
  title: string;
  type: ItemType;
  dueDate?: string;
  status: ItemStatus;
  portfolioUpdated?: boolean;
  notes?: string;
  createdAt: string;
}

interface LearnedRule {
  id: string;
  pattern: string;
  proposal: string;
  repeats: number;
  state: 'pending' | 'accepted' | 'dismissed';
}

const STORAGE_ITEMS_KEY = 'friday-items-v1';
const STORAGE_RULES_KEY = 'friday-rules-v1';

/** Item types carry a neutral letter bullet; colour stays reserved for engine lines. */
const TYPE_META: Record<ItemType, { label: string; letter: string }> = {
  hackathon: { label: 'Hackathon', letter: 'H' },
  project: { label: 'Project', letter: 'P' },
  task: { label: 'Task', letter: 'T' },
  achievement: { label: 'Achievement', letter: 'A' },
};

const ROADMAP = [
  {
    title: 'Schedule Generation',
    desc: 'Daily & weekly time-blocking built automatically from your deadlines.',
  },
  {
    title: 'Local-First Finance',
    desc: 'Recurring bills and expected income routed privately with zero bank logins.',
  },
  {
    title: 'Achievement Prompts',
    desc: 'Guided resume & portfolio bullets right after a project or hackathon win.',
  },
  {
    title: 'Career & Workload',
    desc: 'Grounded discussions using your saved projects, pace, and goals.',
  },
];

const DEMO_IDS = new Set(['demo-1', 'demo-2', 'demo-3']);
const DEMO_RULE_IDS = new Set(['rule-1', 'rule-2']);

function loadItems(): FridayItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FridayItem[];
    return parsed.filter((it) => !DEMO_IDS.has(it.id));
  } catch {
    return [];
  }
}

function loadRules(): LearnedRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearnedRule[];
    return parsed.filter((r) => !DEMO_RULE_IDS.has(r.id));
  } catch {
    return [];
  }
}

function formatDueBadge(dueDate?: string): { text: string; urgent: boolean } | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true };
  if (diffDays === 0) return { text: 'Due today', urgent: true };
  if (diffDays === 1) return { text: 'Due tomorrow', urgent: true };
  if (diffDays <= 7) return { text: `In ${diffDays} days`, urgent: false };
  return { text: dueDate, urgent: false };
}

export function TodayPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FridayItem[]>(loadItems);
  const [rules, setRules] = useState<LearnedRule[]>(loadRules);
  const [filterType, setFilterType] = useState<'all' | ItemType>('all');
  const [search, setSearch] = useState('');

  // Quick capture state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ItemType>('task');
  const [newDue, setNewDue] = useState('');

  const persistItems = (next: FridayItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(next));
    } catch {}
  };

  const persistRules = (next: LearnedRule[]) => {
    setRules(next);
    try {
      localStorage.setItem(STORAGE_RULES_KEY, JSON.stringify(next));
    } catch {}
  };

  // Sync with backend ItemStore and RepetitionStore on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/v1/items');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.items)) {
            const mapped: FridayItem[] = data.items.map((it: Record<string, unknown>) => ({
              id: String(it.id ?? ''),
              title: String(it.title ?? ''),
              type: (['hackathon', 'project', 'task', 'achievement'].includes(String(it.item_type))
                ? String(it.item_type)
                : 'task') as ItemType,
              dueDate: typeof it.due_date === 'string' && it.due_date ? it.due_date : undefined,
              status: it.status === 'done' ? 'done' : 'open',
              portfolioUpdated: typeof it.needs_update === 'boolean' ? !it.needs_update : undefined,
              notes: typeof it.notes === 'string' && it.notes ? it.notes : undefined,
              createdAt: typeof it.created_at === 'string' ? it.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
            }));
            persistItems(mapped);
          }
        }
      } catch {
        // Offline / server unavailable — keep local items
      }

      try {
        const res = await apiFetch('/v1/repetitions/rules');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.rules)) {
            const mapped: LearnedRule[] = data.rules.map((r: Record<string, unknown>) => ({
              id: String(r.id ?? ''),
              pattern: String(r.label ?? r.action_key ?? ''),
              proposal: String(r.proposal_text ?? ''),
              repeats: Number(r.count ?? 0),
              state:
                r.status === 'accepted'
                  ? 'accepted'
                  : r.status === 'rejected'
                    ? 'dismissed'
                    : 'pending',
            }));
            persistRules(mapped);
          }
        }
      } catch {
        // Offline / server unavailable — keep local rules
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const tempId = `item-${Date.now()}`;
    const item: FridayItem = {
      id: tempId,
      title,
      type: newType,
      dueDate: newDue || undefined,
      status: newType === 'achievement' ? 'done' : 'open',
      portfolioUpdated: newType === 'achievement' ? false : undefined,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    persistItems([item, ...items]);
    setNewTitle('');
    setNewDue('');
    toast.success(`Saved ${TYPE_META[newType].label.toLowerCase()}: "${title}"`);

    try {
      const res = await apiFetch('/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          item_type: newType,
          due_date: newDue || null,
          status: item.status,
          needs_update: newType === 'achievement' ? true : undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (created?.id) {
          persistItems([
            { ...item, id: String(created.id) },
            ...items,
          ]);
        }
      }
    } catch {
      // Keep local item if backend is unreachable
    }
  };

  const toggleItemStatus = async (id: string) => {
    const current = items.find((it) => it.id === id);
    if (!current) return;
    const nextStatus: ItemStatus = current.status === 'open' ? 'done' : 'open';
    persistItems(
      items.map((it) => {
        if (it.id !== id) return it;
        return {
          ...it,
          status: nextStatus,
          portfolioUpdated:
            nextStatus === 'done' && (it.type === 'project' || it.type === 'achievement' || it.type === 'hackathon')
              ? it.portfolioUpdated ?? false
              : it.portfolioUpdated,
        };
      }),
    );
    try {
      await apiFetch(`/v1/items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          needs_update:
            nextStatus === 'done' && (current.type === 'project' || current.type === 'achievement' || current.type === 'hackathon')
              ? current.portfolioUpdated === false
              : undefined,
        }),
      });
    } catch {}
  };

  const markPortfolioUpdated = async (id: string) => {
    persistItems(
      items.map((it) => (it.id === id ? { ...it, portfolioUpdated: true } : it)),
    );
    toast.success('Marked resume & portfolio as updated');
    try {
      await apiFetch(`/v1/items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needs_update: false }),
      });
    } catch {}
  };

  const deleteItem = async (id: string) => {
    persistItems(items.filter((it) => it.id !== id));
    try {
      await apiFetch(`/v1/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {}
  };

  const updateRule = async (id: string, state: 'accepted' | 'dismissed') => {
    persistRules(rules.map((r) => (r.id === id ? { ...r, state } : r)));
    toast.success(state === 'accepted' ? 'Rule enabled' : 'Rule dismissed');
    try {
      await apiFetch(`/v1/repetitions/rules/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: state === 'accepted' ? 'accept' : 'reject' }),
      });
    } catch {}
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterType !== 'all' && it.type !== filterType) return false;
      if (q && !it.title.toLowerCase().includes(q) && !(it.notes || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, filterType, search]);

  const upcomingCount = items.filter((i) => i.status === 'open' && i.dueDate).length;
  const needsUpdateCount = items.filter(
    (i) => i.status === 'done' && i.portfolioUpdated === false,
  ).length;
  const openCount = items.filter((i) => i.status === 'open').length;

  const pendingRules = rules.filter((r) => r.state === 'pending');

  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const figure = (n: number) => <span className="tn-mono font-bold" style={{ color: 'var(--color-text)' }}>{n}</span>;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
      <div className="max-w-[1120px] mx-auto flex flex-col pb-16">
        {/* Morning Brief */}
        <section aria-labelledby="today-title" className="tn-rule-top pt-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id="today-title" className="tn-page-title">Your day at a glance</h1>
              <p className="tn-mono text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Personalized Morning Brief · {today}
              </p>
              <p className="text-[15px] leading-[24px] mt-3 max-w-[65ch]" style={{ color: 'var(--color-text-secondary)' }}>
                {figure(upcomingCount)} upcoming deadline{upcomingCount === 1 ? '' : 's'},{' '}
                {figure(needsUpdateCount)} completed win{needsUpdateCount === 1 ? '' : 's'} waiting for a resume/portfolio update, and{' '}
                {figure(openCount)} open item{openCount === 1 ? '' : 's'}.
              </p>
            </div>
            <button type="button" onClick={() => navigate('/')} className="tn-btn tn-btn-primary shrink-0 self-start">
              <MessageSquare size={16} aria-hidden="true" />
              Discuss in Chat
            </button>
          </div>

          {/* Quick Capture: the composer bar */}
          <form
            onSubmit={handleAddItem}
            aria-label="Quick capture"
            className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 transition-colors duration-[120ms] focus-within:border-[var(--action)]"
            style={{ border: '2px solid var(--color-input-border)', borderRadius: 2, background: 'var(--color-input-bg)' }}
          >
            <div className="flex-1 min-w-0 flex items-center gap-2.5 px-2">
              <Mic size={16} aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                aria-label="Quick capture"
                placeholder="Quick capture a hackathon, project, task, or win... (or tap Right Ctrl ×2)"
                className="flex-1 min-w-0 h-9 bg-transparent text-[15px] outline-none"
                style={{ color: 'var(--color-text)' }}
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ItemType)}
                aria-label="Item type"
                className="tn-select w-auto flex-1 sm:flex-none cursor-pointer"
              >
                <option value="task">Task</option>
                <option value="hackathon">Hackathon</option>
                <option value="project">Project</option>
                <option value="achievement">Achievement</option>
              </select>

              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                aria-label="Due date"
                className="tn-input tn-mono w-auto flex-1 sm:flex-none"
              />

              <button type="submit" disabled={!newTitle.trim()} className="tn-btn tn-btn-primary">
                <Plus size={16} aria-hidden="true" />
                Save
              </button>
            </div>
          </form>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-10 gap-y-12 mt-12">
          {/* Item Store */}
          <section aria-labelledby="today-items" className="min-w-0">
            <SectionHeading
              as="h2"
              id="today-items"
              actions={
                <label className="relative flex items-center">
                  <Search size={14} aria-hidden="true" className="absolute left-2.5" style={{ color: 'var(--color-text-tertiary)' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search items"
                    placeholder="Search items..."
                    className="tn-input h-8 w-40 sm:w-48 pl-8 text-[13px]"
                  />
                </label>
              }
            >
              Projects, Hackathons & Tasks
            </SectionHeading>
            <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Tracked locally so Friday remembers what is due and what needs updating.
            </p>

            <div role="tablist" aria-label="Filter items by type" className="tn-tabs mt-3 overflow-x-auto">
              {(['all', 'hackathon', 'project', 'task', 'achievement'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={filterType === t}
                  aria-controls="today-item-list"
                  onClick={() => setFilterType(t)}
                  className="tn-tab shrink-0"
                >
                  {t === 'all' ? 'All' : TYPE_META[t].label + 's'}
                </button>
              ))}
            </div>

            <ul id="today-item-list" className="flex flex-col">
              {filteredItems.length === 0 ? (
                <li className="py-8 text-[14px]" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  No matching items yet. Use Quick Capture above to add one.
                </li>
              ) : (
                filteredItems.map((item) => {
                  const meta = TYPE_META[item.type];
                  const due = formatDueBadge(item.dueDate);
                  const overdue = !!due && due.text.endsWith('overdue');
                  const done = item.status === 'done';
                  return (
                    <li
                      key={item.id}
                      className="group flex items-start gap-3 py-3 px-1"
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleItemStatus(item.id)}
                        aria-label={done ? 'Mark open' : 'Mark done'}
                        aria-pressed={done}
                        className="mt-px w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer transition-colors duration-[120ms]"
                        style={{
                          borderRadius: 2,
                          background: done ? 'var(--color-text)' : 'transparent',
                          border: `2px solid ${done ? 'var(--color-text)' : 'var(--color-input-border)'}`,
                          color: 'var(--color-bg)',
                        }}
                      >
                        {done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                      </button>

                      <LineBullet letter={meta.letter} size={20} className="mt-px" />

                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[15px] leading-[22px] font-medium break-words ${done ? 'line-through' : ''}`}
                          style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}
                        >
                          {item.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          <span>{meta.label}</span>
                          {due && item.status === 'open' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className="tn-mono"
                                style={{
                                  color: overdue ? 'var(--fail)' : due.urgent ? 'var(--color-text)' : 'var(--color-text-secondary)',
                                  fontWeight: due.urgent ? 600 : 400,
                                }}
                              >
                                {due.text}
                              </span>
                            </>
                          )}
                        </div>

                        {item.notes && (
                          <p className="text-[13px] mt-1 max-w-[65ch]" style={{ color: 'var(--color-text-secondary)' }}>
                            {item.notes}
                          </p>
                        )}

                        {done && item.portfolioUpdated === false && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
                              <Bell size={14} aria-hidden="true" />
                              Update reminder: add to resume or portfolio
                            </span>
                            <button
                              type="button"
                              onClick={() => markPortfolioUpdated(item.id)}
                              className="text-[13px] font-medium underline underline-offset-[3px] cursor-pointer"
                              style={{ color: 'var(--action)' }}
                            >
                              Mark updated
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteItem(item.id)}
                        aria-label={`Remove ${item.title}`}
                        className="tn-icon-btn shrink-0 -my-1"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {/* Learned Rules and channels */}
          <div className="flex flex-col gap-12 min-w-0">
            <section aria-labelledby="today-rules">
              <SectionHeading as="h2" id="today-rules" actions={<StatusText>Always confirms</StatusText>}>
                Learned Rules
              </SectionHeading>
              <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                After 3 repeated patterns, Friday proposes a shortcut and waits for your approval.
              </p>

              <ul className="mt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                {pendingRules.length === 0 ? (
                  <li className="py-4 text-[13px]" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                    No pending rule proposals right now.
                  </li>
                ) : (
                  pendingRules.map((rule) => (
                    <li key={rule.id} className="py-3 flex flex-col gap-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="tn-mono text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        Observed {rule.repeats}× · {rule.pattern}
                      </div>
                      <div className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                        {rule.proposal}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button type="button" onClick={() => updateRule(rule.id, 'accepted')} className="tn-btn tn-btn-sm tn-btn-primary">
                          <Check size={14} aria-hidden="true" />
                          Accept
                        </button>
                        <button type="button" onClick={() => updateRule(rule.id, 'dismissed')} className="tn-btn tn-btn-sm tn-btn-ghost">
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section aria-labelledby="today-channels">
              <SectionHeading
                as="h2"
                id="today-channels"
                actions={
                  <button
                    type="button"
                    onClick={() => navigate('/data-sources')}
                    className="inline-flex items-center gap-1 text-[13px] font-medium cursor-pointer underline-offset-[3px] hover:underline"
                    style={{ color: 'var(--action)' }}
                  >
                    Configure <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                }
              >
                Reminder & Capture Channels
              </SectionHeading>
              <dl className="mt-1 text-[14px]">
                <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <dt style={{ color: 'var(--color-text-secondary)' }}>Voice Hotkey</dt>
                  <dd><Kbd>Right Ctrl ×2</Kbd></dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <dt style={{ color: 'var(--color-text-secondary)' }}>Reminder Order</dt>
                  <dd className="text-right" style={{ color: 'var(--color-text)' }}>Email → Telegram → Web</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>

        {/* Future Roadmap (v2) */}
        <section aria-labelledby="today-roadmap" className="mt-14">
          <SectionHeading as="h2" id="today-roadmap" actions={<StatusText tone="muted" mono={false}>Planned v2 workspaces</StatusText>}>
            Coming Next in Friday
          </SectionHeading>
          <ul className="mt-1">
            {ROADMAP.map((row) => (
              <li
                key={row.title}
                className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[220px_minmax(0,1fr)_auto] gap-x-6 gap-y-0.5 py-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <span className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>{row.title}</span>
                <span className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {row.desc}
                </span>
                <span className="tn-mono text-[12px] col-start-2 row-start-1 md:col-start-auto" style={{ color: 'var(--color-text-tertiary)' }}>v2</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
