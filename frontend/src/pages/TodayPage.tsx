import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Sun,
  Mic,
  Plus,
  Trophy,
  FolderGit2,
  CheckSquare,
  Flame,
  Calendar,
  Sparkles,
  Check,
  X,
  Clock,
  Wallet,
  MessageSquare,
  ArrowUpRight,
  Search,
  Bell,
} from 'lucide-react';
import { toast } from 'sonner';

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

const DEFAULT_ITEMS: FridayItem[] = [
  {
    id: 'demo-1',
    title: 'AI Agents Hackathon — Final Demo & Submission',
    type: 'hackathon',
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    status: 'open',
    notes: 'Record 2-minute walkthrough and polish README.',
    createdAt: new Date().toISOString().slice(0, 10),
  },
  {
    id: 'demo-2',
    title: 'OpenJarvis Friday UI & Voice Capture',
    type: 'project',
    dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    status: 'open',
    notes: 'Test Right Ctrl double-tap + Whisper latency.',
    createdAt: new Date().toISOString().slice(0, 10),
  },
  {
    id: 'demo-3',
    title: 'Regional Systems Buildathon — Runner Up',
    type: 'achievement',
    status: 'done',
    portfolioUpdated: false,
    notes: 'Completed — pending resume & portfolio update.',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
  },
];

const DEFAULT_RULES: LearnedRule[] = [
  {
    id: 'rule-1',
    pattern: 'You often capture hackathon deadlines on Monday mornings.',
    proposal: 'Send a Monday 9:00 AM digest of upcoming hackathons & open tasks?',
    repeats: 3,
    state: 'pending',
  },
  {
    id: 'rule-2',
    pattern: 'You ask for a resume bullet after finishing a project.',
    proposal: 'Automatically draft a resume & portfolio summary when an item is marked Done?',
    repeats: 3,
    state: 'pending',
  },
];

const TYPE_META: Record<ItemType, { label: string; icon: typeof Flame; color: string; bg: string }> = {
  hackathon: {
    label: 'Hackathon',
    icon: Flame,
    color: 'var(--color-accent-amber)',
    bg: 'var(--color-accent-amber-subtle)',
  },
  project: {
    label: 'Project',
    icon: FolderGit2,
    color: 'var(--color-accent)',
    bg: 'var(--color-accent-subtle)',
  },
  task: {
    label: 'Task',
    icon: CheckSquare,
    color: 'var(--color-accent-purple)',
    bg: 'var(--color-accent-purple-subtle)',
  },
  achievement: {
    label: 'Achievement',
    icon: Trophy,
    color: 'var(--color-success)',
    bg: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
  },
};

function loadItems(): FridayItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_ITEMS_KEY);
    return raw ? (JSON.parse(raw) as FridayItem[]) : DEFAULT_ITEMS;
  } catch {
    return DEFAULT_ITEMS;
  }
}

function loadRules(): LearnedRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_RULES_KEY);
    return raw ? (JSON.parse(raw) as LearnedRule[]) : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
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

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const item: FridayItem = {
      id: `item-${Date.now()}`,
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
  };

  const toggleItemStatus = (id: string) => {
    persistItems(
      items.map((it) => {
        if (it.id !== id) return it;
        const nextStatus: ItemStatus = it.status === 'open' ? 'done' : 'open';
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
  };

  const markPortfolioUpdated = (id: string) => {
    persistItems(
      items.map((it) => (it.id === id ? { ...it, portfolioUpdated: true } : it)),
    );
    toast.success('Marked resume & portfolio as updated');
  };

  const deleteItem = (id: string) => {
    persistItems(items.filter((it) => it.id !== id));
  };

  const updateRule = (id: string, state: 'accepted' | 'dismissed') => {
    persistRules(rules.map((r) => (r.id === id ? { ...r, state } : r)));
    toast.success(state === 'accepted' ? 'Rule enabled' : 'Rule dismissed');
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

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        {/* Morning Brief Hero */}
        <section className="studio-card p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium mb-1.5" style={{ color: 'var(--color-accent-amber)' }}>
                <Sun size={14} />
                <span>Personalized Morning Brief</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                Your day at a glance
              </h1>
              <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
                {upcomingCount} upcoming deadline{upcomingCount === 1 ? '' : 's'},{' '}
                {needsUpdateCount} completed win{needsUpdateCount === 1 ? '' : 's'} waiting for a resume/portfolio update, and{' '}
                {openCount} open item{openCount === 1 ? '' : 's'}.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-90"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                }}
              >
                <Sparkles size={15} />
                Discuss in Chat
              </button>
            </div>
          </div>

          {/* Quick Capture Bar */}
          <form
            onSubmit={handleAddItem}
            className="mt-5 pt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
          >
            <div
              className="flex-1 flex items-center gap-2.5 px-3.5 py-2 rounded-lg"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Mic size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Quick capture a hackathon, project, task, or win... (or tap Right Ctrl ×2)"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-text)' }}
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ItemType)}
                aria-label="Item type"
                className="px-3 py-2 rounded-lg text-sm cursor-pointer"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
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
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />

              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Plus size={15} />
                Save
              </button>
            </div>
          </form>
        </section>

        {/* Main 2-column grid: Items Store + Reminders/Rules */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left 2 cols: Item Store */}
          <section className="lg:col-span-2 studio-card p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                  Projects, Hackathons & Tasks
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Tracked locally so Friday remembers what is due and what needs updating.
                </p>
              </div>

              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Search size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items..."
                  className="bg-transparent outline-none w-36"
                  style={{ color: 'var(--color-text)' }}
                />
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'hackathon', 'project', 'task', 'achievement'] as const).map((t) => {
                const active = filterType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                    style={{
                      background: active ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                      color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      border: active
                        ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)'
                        : '1px solid var(--color-border)',
                    }}
                  >
                    {t === 'all' ? 'All' : TYPE_META[t].label + 's'}
                  </button>
                );
              })}
            </div>

            {/* Item rows */}
            <div className="flex flex-col gap-2">
              {filteredItems.length === 0 ? (
                <div
                  className="py-10 text-center rounded-lg text-sm"
                  style={{
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-secondary)',
                    border: '1px dashed var(--color-border)',
                  }}
                >
                  No matching items yet. Use Quick Capture above to add one.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const meta = TYPE_META[item.type];
                  const Icon = meta.icon;
                  const due = formatDueBadge(item.dueDate);
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3.5 rounded-lg transition-colors"
                      style={{
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <button
                        onClick={() => toggleItemStatus(item.id)}
                        aria-label={item.status === 'done' ? 'Mark open' : 'Mark done'}
                        className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        style={{
                          background: item.status === 'done' ? 'var(--color-success)' : 'transparent',
                          border:
                            item.status === 'done'
                              ? '1px solid var(--color-success)'
                              : '1.5px solid var(--color-text-tertiary)',
                          color: '#071224',
                        }}
                      >
                        {item.status === 'done' && <Check size={12} strokeWidth={3} />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-medium ${item.status === 'done' ? 'line-through opacity-70' : ''}`}
                            style={{ color: 'var(--color-text)' }}
                          >
                            {item.title}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            <Icon size={11} />
                            {meta.label}
                          </span>
                          {due && item.status === 'open' && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{
                                background: due.urgent
                                  ? 'var(--color-accent-amber-subtle)'
                                  : 'var(--color-bg-tertiary)',
                                color: due.urgent
                                  ? 'var(--color-accent-amber)'
                                  : 'var(--color-text-secondary)',
                              }}
                            >
                              <Calendar size={11} />
                              {due.text}
                            </span>
                          )}
                        </div>

                        {item.notes && (
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                            {item.notes}
                          </p>
                        )}

                        {item.status === 'done' && item.portfolioUpdated === false && (
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium"
                              style={{ color: 'var(--color-accent-amber)' }}
                            >
                              <Bell size={12} />
                              Update reminder: add to resume or portfolio
                            </span>
                            <button
                              onClick={() => markPortfolioUpdated(item.id)}
                              className="text-xs font-medium underline cursor-pointer"
                              style={{ color: 'var(--color-accent)' }}
                            >
                              Mark updated
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => deleteItem(item.id)}
                        aria-label={`Remove ${item.title}`}
                        className="p-1.5 rounded-md cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right col: Learned Rules & Channels */}
          <div className="flex flex-col gap-5">
            <section className="studio-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                  Learned Rules
                </h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: 'var(--color-accent-subtle)',
                    color: 'var(--color-accent)',
                  }}
                >
                  Always confirms
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                After 3 repeated patterns, Friday proposes a shortcut and waits for your approval.
              </p>

              {pendingRules.length === 0 ? (
                <div
                  className="p-4 rounded-lg text-xs text-center"
                  style={{
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  No pending rule proposals right now.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {pendingRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3.5 rounded-lg flex flex-col gap-2"
                      style={{
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        Observed {rule.repeats}× · {rule.pattern}
                      </div>
                      <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {rule.proposal}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => updateRule(rule.id, 'accepted')}
                          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer"
                          style={{
                            background: 'var(--color-accent)',
                            color: 'var(--color-on-accent)',
                          }}
                        >
                          <Check size={12} />
                          Accept
                        </button>
                        <button
                          onClick={() => updateRule(rule.id, 'dismissed')}
                          className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer"
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Delivery Channels summary */}
            <section className="studio-card p-5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Reminder & Capture Channels
                </h2>
                <button
                  onClick={() => navigate('/data-sources')}
                  className="text-xs font-medium flex items-center gap-1 cursor-pointer"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Configure <ArrowUpRight size={12} />
                </button>
              </div>
              <div className="flex flex-col gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <div className="flex items-center justify-between py-1">
                  <span>Voice Hotkey</span>
                  <kbd
                    className="px-2 py-0.5 rounded studio-mono"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    Right Ctrl ×2
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Reminder Order</span>
                  <span style={{ color: 'var(--color-text)' }}>Email → Telegram → Web</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Future Roadmap (v2) */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text-secondary)' }}>
              Coming Next in Friday
            </h2>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Planned v2 workspaces
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                icon: Clock,
                title: 'Schedule Generation',
                desc: 'Daily & weekly time-blocking built automatically from your deadlines.',
              },
              {
                icon: Wallet,
                title: 'Local-First Finance',
                desc: 'Recurring bills and expected income routed privately with zero bank logins.',
              },
              {
                icon: Trophy,
                title: 'Achievement Prompts',
                desc: 'Guided resume & portfolio bullets right after a project or hackathon win.',
              },
              {
                icon: MessageSquare,
                title: 'Career & Workload',
                desc: 'Grounded discussions using your saved projects, pace, and goals.',
              },
            ].map((card) => {
              const CardIcon = card.icon;
              return (
                <div
                  key={card.title}
                  className="p-4 rounded-xl flex flex-col gap-2"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <CardIcon size={16} style={{ color: 'var(--color-accent)' }} />
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      v2
                    </span>
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {card.title}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {card.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
