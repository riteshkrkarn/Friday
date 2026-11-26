import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles,
  Terminal,
  Globe,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  CalendarCheck2,
  Mic,
  Bell,
  Repeat,
  Bot,
  BarChart3,
  Settings,
  Database,
} from 'lucide-react';
import { isTauri, checkHealth } from '../lib/api';

interface WalkthroughStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  actionLabel: string;
  actionPath: string;
  icon: typeof MessageSquare;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'chat',
    title: 'Chat & Multi-Model Routing',
    subtitle: 'Local Ollama, NVIDIA NIM, Groq, OpenAI, Anthropic, or Gemini',
    description:
      'Chat with Friday using any local or cloud model. Switch models on the fly with Cmd/Ctrl+K, toggle Deep Research for multi-step web synthesis, and inspect latency, token budgets, and energy usage in each reply footer.',
    highlights: [
      'Model switcher (Cmd/Ctrl+K) across local and cloud providers',
      'Built-in tools: Web Search, Calculator, Code Interpreter, File Read, Item Store',
      'Smart auto-named chat history with inline rename & delete',
    ],
    actionLabel: 'Open Chat',
    actionPath: '/',
    icon: MessageSquare,
  },
  {
    id: 'capture',
    title: 'Quick Capture (Voice, Hotkey & Telegram)',
    subtitle: 'Log hackathons, projects, tasks, and achievements in seconds',
    description:
      'Never lose an idea or deadline. Capture raw voice or text notes and Friday automatically extracts a clean title, category (hackathon, project, task, achievement), due date, and notes.',
    highlights: [
      'Global hotkey: double-tap Right Ctrl for instant voice capture',
      'Web capture bar in Today & Brief with type and due date',
      'Telegram fallback: send /capture <note> from anywhere',
    ],
    actionLabel: 'Try Quick Capture',
    actionPath: '/today',
    icon: Mic,
  },
  {
    id: 'brief',
    title: 'Today & Morning Brief',
    subtitle: 'Overdue alerts, upcoming deadlines, and portfolio tracking',
    description:
      'Start every day with a focused briefing built strictly from your saved items. Friday surfaces overdue items first, followed by upcoming deadlines, open tasks, and completed wins waiting for a resume or portfolio update.',
    highlights: [
      'Filterable Item Store for Hackathons, Projects, Tasks, and Achievements',
      'Tracks completed wins that still need a resume/portfolio update',
      'One-click "Discuss in Chat" to plan your day with Friday',
    ],
    actionLabel: 'Open Today & Brief',
    actionPath: '/today',
    icon: CalendarCheck2,
  },
  {
    id: 'reminders',
    title: 'Daily Reminders & Channels',
    subtitle: 'Email, Telegram, and Web UI notifications',
    description:
      'Friday runs scheduled daily deadline scans and 14-day portfolio/resume update nudges, delivering alerts in order: Email, then Telegram, then Web UI.',
    highlights: [
      '24-hour deduplication so you are never spammed for the same item',
      'Configurable lead time and delivery channels in Data Sources',
      'Works both in the Web UI and via Telegram bot commands',
    ],
    actionLabel: 'Configure Channels',
    actionPath: '/data-sources',
    icon: Bell,
  },
  {
    id: 'learning',
    title: 'Repetition Learning & Shortcuts',
    subtitle: 'Turn repeated habits into one-tap automations',
    description:
      'When Friday notices you repeating an action—like logging hackathon deadlines every Monday or drafting resume bullets after finishing projects—it proposes a shortcut or scheduled rule for your approval.',
    highlights: [
      'Confirmation-gated: Friday never enables a rule without your consent',
      'Accept, customize, or dismiss proposals right from Today & Brief',
      'Learns your personal workflow without manual rule writing',
    ],
    actionLabel: 'View Learned Rules',
    actionPath: '/today',
    icon: Repeat,
  },
  {
    id: 'workspace',
    title: 'Agents, Overview & Settings',
    subtitle: 'Monitor performance, manage API keys, and run custom agents',
    description:
      'Create specialized or scheduled agents, connect local folders as knowledge sources, monitor token cost and energy telemetry, and manage your local or cloud API keys.',
    highlights: [
      'Agents (/agents): build and schedule autonomous workflows',
      'Overview (/dashboard): track energy, cost savings, and traces',
      'Settings (/settings): configure NVIDIA NIM, Groq, Ollama, and voice',
    ],
    actionLabel: 'Open Settings',
    actionPath: '/settings',
    icon: Bot,
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="relative group rounded-lg px-4 py-3 text-sm font-mono overflow-x-auto"
      style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
    >
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
      <button
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
        title="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: typeof Terminal;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Icon size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-text)' }}>
          {title}
        </span>
        {open ? (
          <ChevronDown size={16} style={{ color: 'var(--color-text-tertiary)' }} />
        ) : (
          <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </button>
      {open && (
        <div
          className="px-5 pb-5 pt-1 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function GetStartedPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const isDesktop = useMemo(() => isTauri(), []);

  useEffect(() => {
    checkHealth().then(setHealthy);
  }, []);

  const step = WALKTHROUGH_STEPS[stepIdx];
  const StepIcon = step.icon;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>
              <Sparkles size={14} />
              <span>Friday Walkthrough</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              Everything Friday can do
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Step through Friday&apos;s core workflows or jump straight to any workspace.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {healthy === true && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}>
                <CheckCircle2 size={13} />
                Server online
              </span>
            )}
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            >
              <MessageSquare size={15} />
              Open Chat
            </button>
          </div>
        </header>

        {/* Interactive Step-by-Step Walkthrough */}
        <section
          className="rounded-xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {/* Step pills */}
          <div className="flex flex-wrap gap-1.5">
            {WALKTHROUGH_STEPS.map((s, idx) => {
              const active = idx === stepIdx;
              const PillIcon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setStepIdx(idx)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    background: active ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    border: active
                      ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)'
                      : '1px solid var(--color-border)',
                  }}
                >
                  <PillIcon size={13} />
                  <span>{idx + 1}. {s.title.split('&')[0].trim()}</span>
                </button>
              );
            })}
          </div>

          {/* Active step card */}
          <div
            className="rounded-xl p-5 flex flex-col gap-4"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div className="flex items-start gap-3.5">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
              >
                <StepIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  Step {stepIdx + 1} of {WALKTHROUGH_STEPS.length}
                </div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                  {step.title}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-accent)' }}>
                  {step.subtitle}
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {step.description}
            </p>

            <ul className="flex flex-col gap-2">
              {step.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text)' }}>
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={stepIdx === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <ArrowLeft size={13} />
                  Previous
                </button>
                <button
                  onClick={() => setStepIdx((i) => Math.min(WALKTHROUGH_STEPS.length - 1, i + 1))}
                  disabled={stepIdx === WALKTHROUGH_STEPS.length - 1}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Next
                  <ArrowRight size={13} />
                </button>
              </div>

              <button
                onClick={() => navigate(step.actionPath)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-opacity hover:opacity-90"
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
              >
                {step.actionLabel}
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </section>

        {/* Quick Workspace Map */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: MessageSquare, label: 'Chat', desc: 'Talk to Friday, run tools & Deep Research', path: '/' },
            { icon: CalendarCheck2, label: 'Today & Brief', desc: 'Morning brief, Item Store & learned rules', path: '/today' },
            { icon: Database, label: 'Data Sources', desc: 'Local folders, Email & Telegram channels', path: '/data-sources' },
            { icon: BarChart3, label: 'Overview', desc: 'Energy, cost savings & execution traces', path: '/dashboard' },
          ].map((card) => {
            const CardIcon = card.icon;
            return (
              <button
                key={card.path}
                onClick={() => navigate(card.path)}
                className="text-left p-4 rounded-xl flex flex-col gap-1.5 cursor-pointer transition-colors"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              >
                <CardIcon size={16} style={{ color: 'var(--color-accent)' }} />
                <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {card.label}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {card.desc}
                </p>
              </button>
            );
          })}
        </section>

        {/* Shortcuts & Setup Reference */}
        <div className="flex flex-col gap-3">
          <Section icon={Cpu} title="Keyboard Shortcuts" defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Cmd/Ctrl+K</kbd> Switch model</div>
              <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Right Ctrl ×2</kbd> Voice Quick Capture</div>
              <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Cmd/Ctrl+I</kbd> Toggle System panel</div>
              <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Cmd/Ctrl+N</kbd> New chat</div>
            </div>
          </Section>

          {!isDesktop && (
            <Section icon={Terminal} title="CLI & Self-Hosted Commands">
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Start the Friday API server and Web UI locally:
              </p>
              <CodeBlock code={'jarvis serve --port 8000'} />
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Run diagnostics or start the interactive CLI:
              </p>
              <CodeBlock code={'jarvis doctor\njarvis chat'} />
            </Section>
          )}

          <Section icon={Settings} title="Cloud Keys & Environment">
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Configure NVIDIA NIM, Groq, OpenAI, Anthropic, Gemini, Email SMTP, or Telegram tokens in Settings or your `.env` file.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/settings')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              >
                Open Settings <ArrowRight size={12} />
              </button>
            </div>
          </Section>

          {!isDesktop && (
            <Section icon={Globe} title="Telegram Bot Commands">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <div><code className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>/capture &lt;note&gt;</code> Save an item</div>
                <div><code className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>/brief</code> Get morning briefing</div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
