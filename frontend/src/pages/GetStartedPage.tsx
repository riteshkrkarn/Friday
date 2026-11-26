import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Terminal,
  Globe,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  CalendarCheck2,
  Mic,
  Bell,
  Repeat,
  Bot,
  Settings,
} from 'lucide-react';
import { isTauri, checkHealth } from '../lib/api';
import { Kbd, LineBullet, SectionHeading, Station } from '../components/transit';

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
      className="flex items-start gap-3 pl-4 pr-2 py-2"
      style={{ background: 'var(--color-code-bg)', border: '1px solid var(--color-border)', borderRadius: 2 }}
    >
      <pre className="tn-mono flex-1 min-w-0 py-1 text-[13px] leading-[20px] whitespace-pre-wrap break-all" style={{ color: 'var(--color-text)' }}>
        {code}
      </pre>
      <button type="button" onClick={handleCopy} className="tn-icon-btn shrink-0" title="Copy" aria-label={copied ? 'Copied' : 'Copy'}>
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

/** A ruled disclosure row; its body opens below the rule. */
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
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-1 py-3.5 text-left cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--color-bg-tertiary)]"
      >
        <Icon size={16} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        <span className="text-[15px] font-medium flex-1" style={{ color: 'var(--color-text)' }}>
          {title}
        </span>
        {open ? (
          <ChevronDown size={16} aria-hidden="true" style={{ color: 'var(--color-text-tertiary)' }} />
        ) : (
          <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </button>
      {open && <div className="pl-8 pr-1 pb-5 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

/** Letters match the sidebar bullets (C T A D O L S W). */
const WORKSPACE_MAP = [
  { letter: 'C', label: 'Chat', desc: 'Talk to Friday, run tools & Deep Research', path: '/' },
  { letter: 'T', label: 'Today & Brief', desc: 'Morning brief, Item Store & learned rules', path: '/today' },
  { letter: 'D', label: 'Data Sources', desc: 'Local folders, Email & Telegram channels', path: '/data-sources' },
  { letter: 'O', label: 'Overview', desc: 'Energy, cost savings & execution traces', path: '/dashboard' },
];

const SHORTCUTS = [
  { keys: 'Cmd/Ctrl+K', action: 'Switch model' },
  { keys: 'Right Ctrl ×2', action: 'Voice Quick Capture' },
  { keys: 'Cmd/Ctrl+I', action: 'Toggle System panel' },
  { keys: 'Cmd/Ctrl+N', action: 'New chat' },
];

const SECONDARY = 'var(--color-text-secondary)';

export function GetStartedPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const isDesktop = useMemo(() => isTauri(), []);

  useEffect(() => {
    checkHealth().then(setHealthy);
  }, []);

  const step = WALKTHROUGH_STEPS[stepIdx];
  const last = WALKTHROUGH_STEPS.length - 1;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-4 md:px-8 py-8 pb-16 flex flex-col">
        <header className="tn-page-header">
          <div className="min-w-0">
            <h1 className="tn-page-title">Everything Friday can do</h1>
            <p className="text-[14px] mt-1 max-w-[65ch]" style={{ color: SECONDARY }}>
              Step through Friday&apos;s core workflows or jump straight to any workspace.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {healthy === true && (
              <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: SECONDARY }}>
                <Station line="local" size={12} />
                Server online
              </span>
            )}
            <button type="button" onClick={() => navigate('/')} className="tn-btn tn-btn-primary">
              <MessageSquare size={16} aria-hidden="true" />
              Open Chat
            </button>
          </div>
        </header>

        {/* Walkthrough: six stations on one line */}
        <section aria-labelledby="walkthrough-title" className="mt-10">
          <SectionHeading as="h2" id="walkthrough-title">Friday Walkthrough</SectionHeading>

          <ol className="mt-5 flex flex-col md:flex-row" aria-label="Walkthrough steps">
            {WALKTHROUGH_STEPS.map((s, idx) => {
              const active = idx === stepIdx;
              const passed = idx < stepIdx;
              return (
                <li key={s.id} className="relative md:flex-1 min-w-0">
                  {idx < last && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[5.5px] top-[18px] h-full w-[5px] md:left-[8px] md:top-[5.5px] md:h-[5px] md:w-full"
                      style={{ background: passed ? 'var(--color-text)' : 'var(--color-input-border)', transition: 'background-color 160ms ease-out' }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setStepIdx(idx)}
                    aria-current={active ? 'step' : undefined}
                    className="relative flex md:flex-col items-center md:items-start gap-3 md:gap-2 w-full py-2 md:py-0 pr-3 text-left cursor-pointer group"
                  >
                    <span
                      aria-hidden="true"
                      className="relative z-[1] w-4 h-4 shrink-0 rounded-full"
                      style={{
                        border: `3px solid ${active || passed ? 'var(--color-text)' : 'var(--color-input-border)'}`,
                        background: active ? 'var(--color-text)' : 'var(--color-bg)',
                        transition: 'background-color 160ms ease-out, border-color 160ms ease-out',
                      }}
                    />
                    <span className="min-w-0">
                      <span className="tn-mono block text-[11px] leading-[14px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {idx + 1}
                      </span>
                      <span
                        className="block text-[13px] leading-[18px] group-hover:underline underline-offset-[3px]"
                        style={{ color: active ? 'var(--color-text)' : SECONDARY, fontWeight: active ? 700 : 500 }}
                      >
                        {s.title.split('&')[0].trim()}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Active step */}
          <article className="tn-panel tn-rule-top mt-6 p-5 md:p-6 flex flex-col gap-4" aria-live="polite">
            <div>
              <div className="tn-mono text-[12px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Step {stepIdx + 1} of {WALKTHROUGH_STEPS.length}
              </div>
              <h3 className="text-[20px] leading-[26px] font-bold" style={{ color: 'var(--color-text)' }}>
                {step.title}
              </h3>
              <p className="text-[14px] mt-1" style={{ color: SECONDARY }}>
                {step.subtitle}
              </p>
            </div>

            <p className="text-[15px] leading-[24px] max-w-[70ch]" style={{ color: 'var(--color-text)' }}>
              {step.description}
            </p>

            <ul className="flex flex-col">
              {step.highlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 py-2 text-[14px]"
                  style={{ color: 'var(--color-text)', borderTop: '1px solid var(--color-border)' }}
                >
                  <Check size={16} aria-hidden="true" className="mt-[3px] shrink-0" style={{ color: SECONDARY }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={stepIdx === 0}
                  className="tn-btn tn-btn-sm"
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setStepIdx((i) => Math.min(WALKTHROUGH_STEPS.length - 1, i + 1))}
                  disabled={stepIdx === WALKTHROUGH_STEPS.length - 1}
                  className="tn-btn tn-btn-sm"
                >
                  Next
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>

              <button type="button" onClick={() => navigate(step.actionPath)} className="tn-btn tn-btn-sm tn-btn-primary">
                {step.actionLabel}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </article>
        </section>

        {/* Quick Workspace Map */}
        <section aria-labelledby="workspace-map" className="mt-12">
          <SectionHeading as="h2" id="workspace-map">Workspace Map</SectionHeading>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {WORKSPACE_MAP.map((row) => (
              <li key={row.path} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => navigate(row.path)}
                  className="group w-full flex items-start gap-3 px-1 py-3 text-left cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--color-bg-tertiary)]"
                >
                  <LineBullet letter={row.letter} size={22} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium" style={{ color: 'var(--color-text)' }}>{row.label}</span>
                    <span className="block text-[13px] mt-0.5" style={{ color: SECONDARY }}>{row.desc}</span>
                  </span>
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className="mt-1 shrink-0 transition-transform duration-[120ms] group-hover:translate-x-0.5"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Shortcuts & Setup Reference */}
        <section aria-labelledby="setup-reference" className="mt-12">
          <SectionHeading as="h2" id="setup-reference">Shortcuts & Setup Reference</SectionHeading>
          <div className="flex flex-col">
            <Section icon={Cpu} title="Keyboard Shortcuts" defaultOpen>
              <table className="tn-table">
                <thead>
                  <tr>
                    <th scope="col" className="w-48">Keys</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {SHORTCUTS.map((row) => (
                    <tr key={row.keys}>
                      <td><Kbd>{row.keys}</Kbd></td>
                      <td style={{ color: 'var(--color-text)' }}>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            {!isDesktop && (
              <Section icon={Terminal} title="CLI & Self-Hosted Commands">
                <p className="text-[13px]" style={{ color: SECONDARY }}>
                  Start the Friday API server and Web UI locally:
                </p>
                <CodeBlock code={'jarvis serve --port 8000'} />
                <p className="text-[13px]" style={{ color: SECONDARY }}>
                  Run diagnostics or start the interactive CLI:
                </p>
                <CodeBlock code={'jarvis doctor\njarvis chat'} />
              </Section>
            )}

            <Section icon={Settings} title="Cloud Keys & Environment">
              <p className="text-[13px] max-w-[65ch]" style={{ color: SECONDARY }}>
                Configure NVIDIA NIM, Groq, OpenAI, Anthropic, Gemini, Email SMTP, or Telegram tokens in Settings or your <code className="tn-mono text-[12px]">.env</code> file.
              </p>
              <div>
                <button type="button" onClick={() => navigate('/settings')} className="tn-btn tn-btn-sm">
                  Open Settings <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </Section>

            {!isDesktop && (
              <Section icon={Globe} title="Telegram Bot Commands">
                <table className="tn-table">
                  <thead>
                    <tr>
                      <th scope="col" className="w-48">Command</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code className="tn-mono text-[13px]">/capture &lt;note&gt;</code></td>
                      <td style={{ color: 'var(--color-text)' }}>Save an item</td>
                    </tr>
                    <tr>
                      <td><code className="tn-mono text-[13px]">/brief</code></td>
                      <td style={{ color: 'var(--color-text)' }}>Get morning briefing</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
