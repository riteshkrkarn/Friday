import { useEffect, useState, useCallback, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useAppStore } from '../lib/store';
import {
  fetchManagedAgents,
  fetchAgentTasks,
  fetchAgentChannels,
  bindAgentChannel,
  unbindAgentChannel,
  fetchTemplates,
  createManagedAgent,
  pauseManagedAgent,
  resumeManagedAgent,
  deleteManagedAgent,
  runManagedAgent,
  recoverManagedAgent,
  askAgent,
  fetchLearningLog,
  triggerLearning,
  fetchAgentTraces,
  fetchAgentTrace,
  fetchManagedAgent,
  fetchAvailableTools,
  fetchModels,
  updateManagedAgent,
  fetchRecommendedModel,
  sendblueVerify,
  sendblueRegisterWebhook,
  sendblueTest,
  sendblueHealth,
} from '../lib/api';
import type { AgentTask, ChannelBinding, AgentTemplate, ManagedAgent, LearningLogEntry, AgentTrace, AgentTraceDetail, ToolInfo } from '../lib/api';
import { useAgentEvents } from '../lib/useAgentEvents';
import type { AgentEvent } from '../lib/useAgentEvents';
import {
  Plus,
  Pause,
  Play,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Zap,
  MoreHorizontal,
  AlertTriangle,
  MessageSquare,
  X,
  Send,
  RefreshCw,
  Database,
  Pencil,
  Lock,
  ArrowUpRight,
} from 'lucide-react';
import { SOURCE_CATALOG } from '../types/connectors';
import type { ConnectRequest } from '../types/connectors';
import { listConnectors, connectSource } from '../lib/connectors-api';
import type { ToolCallInfo } from '../types';
import { ToolCallCard } from '../components/Chat/ToolCallCard';
import { getAgentSchedule, normalizeAgentSchedule } from '../lib/agent-schedule';
import { lineColor, lineForModel, formatMs } from '../lib/transit-lines';
import type { Line, RouteStop, StationState } from '../lib/transit-lines';
import { LineBullet, PageHeader, RouteStrip, SectionHeading, Station, StatusText } from '../components/transit';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const FAILED_STATUSES = new Set<string>(['error', 'needs_attention', 'budget_exceeded', 'stalled', 'failed']);

/**
 * Status as a station: running/active is the filled station, paused and
 * archived are dashed, every failure state is red, anything else is open.
 */
function statusStation(s: string): StationState {
  if (FAILED_STATUSES.has(s)) return 'failed';
  if (s === 'running' || s === 'active' || s === 'completed') return 'current';
  if (s === 'paused' || s === 'archived') return 'unavailable';
  return 'open';
}

/** An agent rides the line of its model's engine family. */
function agentLine(agent: ManagedAgent): Line {
  return lineForModel((agent.config?.model as string) || '');
}

/** The first letter of a name, for its bullet. */
function bulletLetter(name: string): string {
  const ch = name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '?';
  return ch.toUpperCase();
}

function StatusBadge({ status, line = 'none' }: { status: string; line?: Line }) {
  const state = statusStation(status);
  return (
    <span className="inline-flex items-center gap-1.5" title={status}>
      <Station line={line} state={state} size={12} />
      <StatusText tone={state === 'failed' ? 'fail' : 'default'}>{status.replace('_', ' ')}</StatusText>
    </span>
  );
}

const SENDBLUE_STEPS = ['Credentials', 'Phone number', 'Webhook'];

const SURFACE_STATIONS = { '--station-fill': 'var(--color-surface)' } as CSSProperties;

/** Vertical route: every item hangs on a 5px rail at its station, and items may expand inline. */
function RailItem({
  line,
  state,
  first,
  last,
  children,
  stationTop = 15,
}: {
  line: Line;
  state?: StationState;
  first: boolean;
  last: boolean;
  children: ReactNode;
  /** Distance from the item's top edge to the station's top edge. */
  stationTop?: number;
}) {
  const rail = lineColor(line);
  const centre = stationTop + 7;
  return (
    <li className="relative pl-8">
      {!first && (
        <span aria-hidden="true" className="absolute top-0 w-[5px]" style={{ left: 4.5, height: centre, background: rail }} />
      )}
      {!last && (
        <span aria-hidden="true" className="absolute bottom-0 w-[5px]" style={{ left: 4.5, top: centre, background: rail }} />
      )}
      <span className="absolute left-0 z-[1] flex" style={{ top: stationTop }}>
        <Station line={line} state={state} />
      </span>
      {children}
    </li>
  );
}

/** Stations on one horizontal line: steps behind and the current step are filled. */
function StepLine({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return (
    <ol className="flex items-start list-none" aria-label={label}>
      {steps.map((step, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const hasNext = i < steps.length - 1;
        return (
          <li
            key={step}
            className="flex flex-col min-w-0"
            style={{ flex: hasNext ? '1 1 0' : '0 0 auto' }}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="flex items-center h-[14px]">
              <Station line="tools" state={done || isCurrent ? 'current' : 'open'} className="relative z-[1]" />
              {hasNext && (
                <span
                  aria-hidden="true"
                  className="flex-1 h-[5px] -ml-0.5"
                  style={{ background: done ? lineColor('tools') : 'var(--color-border)' }}
                />
              )}
            </span>
            <span
              className="mt-1.5 pr-3 text-[12px] leading-4 truncate"
              style={{
                color: isCurrent ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                fontWeight: isCurrent ? 600 : 400,
              }}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A labelled mono figure. */
function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col min-w-0">
      <dt className="order-2 text-[12px] leading-4 mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{label}</dt>
      <dd className="order-1 tn-mono text-[18px] leading-6 font-medium" style={{ color: 'var(--color-text)' }}>{value}</dd>
    </div>
  );
}

/** Form label over its control. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[13px] leading-[18px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
    </span>
  );
}

function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
  return `$${cost.toFixed(4)}`;
}

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSchedule(type?: string, value?: string): string {
  if (!type || type === 'manual') return 'Manual';
  if (type === 'cron' && value) {
    // Try to display human-readable for common cron patterns
    const parts = value.trim().split(/\s+/);
    if (parts.length === 5) {
      const [min, hour, , , dow] = parts;
      const hourNum = parseInt(hour, 10);
      const formatHour = (h: number) => {
        if (h === 0) return '12:00 AM';
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return '12:00 PM';
        return `${h - 12}:00 PM`;
      };
      // Daily pattern: 0 H * * *
      if (min === '0' && !isNaN(hourNum) && parts[2] === '*' && parts[3] === '*' && dow === '*') {
        return `Daily at ${formatHour(hourNum)}`;
      }
      // Weekly pattern: 0 H * * days
      if (min === '0' && !isNaN(hourNum) && parts[2] === '*' && parts[3] === '*' && dow !== '*') {
        const DAY_NAMES: Record<string, string> = { '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
        const dayList = dow.split(',').map(d => DAY_NAMES[d] || d).join(', ');
        return `Weekly on ${dayList} at ${formatHour(hourNum)}`;
      }
    }
    return `Cron: ${value}`;
  }
  if (type === 'cron') return 'Cron';
  if (type === 'interval' && value) {
    const total = parseInt(value);
    if (!isNaN(total) && total > 0) {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const parts: string[] = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0) parts.push(`${m}m`);
      if (s > 0) parts.push(`${s}s`);
      return `Every ${parts.join(' ') || '0s'}`;
    }
    return `Every ${value}`;
  }
  return type || 'Manual';
}

function formatAgentSchedule(agent: ManagedAgent): string {
  const { type, value } = getAgentSchedule(agent);
  return formatSchedule(type, value);
}

// ---------------------------------------------------------------------------
// Launch Wizard
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, string> = {
  communication: 'Communication',
  channel: 'Communication',
  search: 'Search & Browse',
  browser: 'Search & Browse',
  code: 'Code & Dev',
  system: 'Code & Dev',
  filesystem: 'Files & Data',
  memory: 'Memory & Knowledge',
  knowledge_graph: 'Memory & Knowledge',
  reasoning: 'Reasoning & AI',
  math: 'Reasoning & AI',
  inference: 'Reasoning & AI',
  agents: 'Reasoning & AI',
  media: 'Media',
};

const TOOL_NAME_FALLBACK: Record<string, string> = {
  file_read: 'Files & Data',
  file_write: 'Files & Data',
  pdf_extract: 'Files & Data',
  db_query: 'Files & Data',
  http_request: 'Files & Data',
  apply_patch: 'Code & Dev',
  git_status: 'Code & Dev',
  git_diff: 'Code & Dev',
  git_log: 'Code & Dev',
  git_commit: 'Code & Dev',
  channel_send: 'Communication',
  channel_list: 'Communication',
  channel_status: 'Communication',
};

const CATEGORY_ORDER = [
  'Communication', 'Search & Browse', 'Code & Dev', 'Files & Data',
  'Memory & Knowledge', 'Reasoning & AI', 'Media',
];

const POPULAR_TOOLS = new Set([
  'slack', 'email', 'telegram', 'whatsapp',
  'web_search', 'browser',
  'code_interpreter', 'shell_exec', 'git_status', 'git_diff',
  'file_read', 'file_write', 'pdf_extract',
  'retrieval', 'memory_store',
  'think', 'llm', 'calculator',
  'image_generate',
]);

const BROWSER_SUB_TOOLS = [
  'browser_navigate', 'browser_click', 'browser_type',
  'browser_screenshot', 'browser_extract', 'browser_axtree',
];

function parseIntervalParts(val: string): { hours: number; minutes: number; seconds: number } {
  const total = parseInt(val) || 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { hours, minutes, seconds };
}

function serializeInterval(hours: number, minutes: number, seconds: number): string {
  return String(hours * 3600 + minutes * 60 + seconds);
}

interface WizardState {
  step: 1 | 2;
  templateId: string;
  templateData: AgentTemplate | null;
  name: string;
  instruction: string;
  model: string;
  scheduleType: string;
  scheduleValue: string;
  selectedTools: string[];
  budget: string;
  routerPolicy: string;
  memoryExtraction: string;
  observationCompression: string;
  retrievalStrategy: string;
  taskDecomposition: string;
  maxTurns: number;
  temperature: number;
}


const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  'daily-briefing': 'Every morning, give me a fun quote of the day, summarize my top important emails, list any meetings today from my calendar, and tell me the weather for [my city].',
  'daily_briefing': 'Every morning, give me a fun quote of the day, summarize my top important emails, list any meetings today from my calendar, and tell me the weather for [my city].',
  'research-monitor': 'Search for the latest news and papers on [your topic]. Summarize the top 3 most relevant findings and explain why they matter.',
  'research_monitor': 'Search for the latest news and papers on [your topic]. Summarize the top 3 most relevant findings and explain why they matter.',
  'code-reviewer': 'Review the latest commits in [repo]. Check for bugs, security issues, and style violations. Summarize findings with file paths and line numbers.',
  'code_reviewer': 'Review the latest commits in [repo]. Check for bugs, security issues, and style violations. Summarize findings with file paths and line numbers.',
  'meeting-prep': 'Before my next meeting, pull context from my emails, messages, and past meetings with the attendees. Summarize key topics and suggest talking points.',
  'meeting_prep': 'Before my next meeting, pull context from my emails, messages, and past meetings with the attendees. Summarize key topics and suggest talking points.',
  'personal_deep_research': 'Search across all my personal data — messages, emails, meetings, documents, and notes — to answer [my question]. Cite your sources.',
  'inbox_triager': 'Check my recent emails and messages. Categorize them by priority (urgent, important, FYI, spam). Summarize the top items I should act on.',
};

function Tooltip({ text }: { text: string }) {
  return <span className="inline-block ml-1 cursor-help tn-mono text-[11px] font-normal" style={{ color: 'var(--color-text-tertiary)' }} title={text}>(?)</span>;
}

// ---------------------------------------------------------------------------
// ToolsPicker — dev-inventory style tool selector used by the launch wizard
// ---------------------------------------------------------------------------

const TOOL_CATEGORY_ORDER = [
  'filesystem',
  'system',
  'code',
  'vcs',
  'storage',
  'memory',
  'knowledge',
  'knowledge_graph',
  'search',
  'network',
  'browser',
  'database',
  'data',
  'math',
  'reasoning',
  'inference',
  'media',
  'audio',
  'skill',
  'channel',
  'communication',
  'other',
];

const TOOL_CATEGORY_LABELS: Record<string, string> = {
  filesystem: 'filesystem',
  system: 'shell & exec',
  code: 'code & repl',
  vcs: 'git',
  storage: 'memory · storage',
  memory: 'memory',
  knowledge: 'knowledge',
  knowledge_graph: 'knowledge graph',
  search: 'search',
  network: 'network',
  browser: 'browser',
  database: 'database',
  data: 'data',
  math: 'math',
  reasoning: 'reasoning',
  inference: 'inference',
  media: 'media',
  audio: 'audio',
  skill: 'skills',
  channel: 'channel primitives',
  communication: 'channels',
  other: 'other',
};

function ToolsPicker({
  tools,
  selected,
  onChange,
}: {
  tools: ToolInfo[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [hovered, setHovered] = useState<ToolInfo | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  // Channels (source === 'channel') live in ChannelRegistry and aren't
  // directly callable by the LLM — the agent talks to them through the
  // `channel_send` tool. Showing them in the tools picker is misleading,
  // so filter them out; channel bindings are configured separately.
  const tollableTools = tools.filter((t) => t.source !== 'channel');

  // Group by category, respecting the preferred order then alphabetical.
  const grouped = (() => {
    const buckets: Record<string, ToolInfo[]> = {};
    for (const t of tollableTools) {
      const cat = TOOL_CATEGORY_ORDER.includes(t.category) ? t.category : 'other';
      (buckets[cat] ||= []).push(t);
    }
    for (const cat of Object.keys(buckets)) {
      buckets[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    return TOOL_CATEGORY_ORDER
      .filter((cat) => buckets[cat]?.length)
      .map((cat) => ({ category: cat, items: buckets[cat] }));
  })();

  const configurable = tollableTools.filter((t) => t.configured).map((t) => t.name);
  const allSelected =
    configurable.length > 0 && configurable.every((n) => selected.includes(n));

  const toggle = (name: string) => {
    const next = selected.includes(name)
      ? selected.filter((t) => t !== name)
      : [...selected, name];
    onChange(next);
    setPulseKey((k) => k + 1);
  };

  const hint = hovered
    ? hovered.configured
      ? hovered.description || hovered.name
      : `Needs ${hovered.credential_keys.join(', ') || 'credentials'}`
    : 'hover a tool for details';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <FieldLabel>Tools</FieldLabel>
        <div className="flex items-center gap-3">
          <span key={pulseKey} className="tn-mono text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
            <span style={{ color: 'var(--color-text)' }}>{selected.length}</span> / {tollableTools.length}
          </span>
          <button
            type="button"
            onClick={() => onChange(allSelected ? [] : configurable)}
            disabled={tools.length === 0}
            className="tn-mono text-[12px] underline underline-offset-2 cursor-pointer disabled:cursor-default hover:text-[var(--color-text)]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {allSelected ? 'none' : 'all'}
          </button>
        </div>
      </div>
      <p className="text-[12px] leading-4 mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
        What the agent is allowed to call. An empty selection makes a
        chat-only agent.
      </p>
      {tools.length === 0 ? (
        <div className="tn-panel px-3 py-2 text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
          Loading available tools…
        </div>
      ) : (
        <div className="tn-panel overflow-hidden" style={SURFACE_STATIONS} onMouseLeave={() => setHovered(null)}>
          <div className="px-3 pt-1 pb-3 overflow-y-auto space-y-4" style={{ maxHeight: 240 }}>
            {grouped.map(({ category, items }) => (
              <div key={category}>
                <SectionHeading as="h4" className="mb-2 pt-1.5 text-[11px]">
                  {TOOL_CATEGORY_LABELS[category] || category}
                </SectionHeading>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((tool) => {
                    const isSelected = selected.includes(tool.name);
                    const disabled = !tool.configured;
                    return (
                      <button
                        key={tool.name}
                        type="button"
                        disabled={disabled}
                        aria-pressed={isSelected}
                        onClick={() => toggle(tool.name)}
                        onMouseEnter={() => setHovered(tool)}
                        onFocus={() => setHovered(tool)}
                        className="tn-chip tn-mono cursor-pointer transition-colors hover:border-[var(--color-text)] disabled:cursor-not-allowed disabled:hover:border-[var(--color-border)]"
                        style={{
                          color: disabled
                            ? 'var(--color-text-tertiary)'
                            : isSelected
                              ? 'var(--color-text)'
                              : 'var(--color-text-secondary)',
                          borderColor: isSelected ? 'var(--color-text)' : undefined,
                          borderStyle: disabled ? 'dashed' : undefined,
                        }}
                      >
                        <Station
                          line="tools"
                          size={10}
                          state={disabled ? 'unavailable' : isSelected ? 'current' : 'open'}
                        />
                        <span>{tool.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Live description strip */}
          <div
            className="flex items-start gap-2 px-3 py-2 tn-mono text-[12px] leading-4"
            style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)', minHeight: 32, color: 'var(--color-text-tertiary)' }}
          >
            {hovered && (
              <span className="shrink-0 font-medium" style={{ color: 'var(--color-text)' }}>
                {hovered.name}
              </span>
            )}
            <span
              className="min-w-0 flex-1 whitespace-normal break-words"
              style={{ color: hovered && !hovered.configured ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}
            >
              {hint}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LaunchWizard({
  templates,
  onClose,
  onLaunched,
}: {
  templates: AgentTemplate[];
  onClose: () => void;
  onLaunched: () => void;
}) {
  const UNIVERSAL_DEFAULTS = {
    memoryExtraction: 'structured_json',
    observationCompression: 'summarize',
    retrievalStrategy: 'sqlite',
    taskDecomposition: 'hierarchical',
    maxTurns: 25,
    temperature: 0.3,
  };

  const [wizard, setWizard] = useState<WizardState>({
    step: 1,
    templateId: '',
    templateData: null,
    name: '',
    instruction: '',
    model: '',
    scheduleType: 'manual',
    scheduleValue: '',
    selectedTools: [],
    budget: '',
    routerPolicy: '',
    ...UNIVERSAL_DEFAULTS,
  });
  const [launching, setLaunching] = useState(false);
  const [recommendedModel, setRecommendedModel] = useState('');
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const models = useAppStore((s) => s.models);

  useEffect(() => {
    fetchRecommendedModel().then((r) => {
      setRecommendedModel(r.model);
      if (!wizard.model) {
        setWizard((w) => ({ ...w, model: r.model }));
      }
    }).catch(() => {});
    fetchAvailableTools().then((tools) => {
      setAvailableTools(tools);
    }).catch(() => {});
  }, []);

  function selectTemplate(tpl: AgentTemplate | null) {
    if (tpl) {
      setWizard((w) => ({
        ...w,
        step: 2,
        templateId: tpl.id,
        templateData: tpl,
        name: '',
        instruction: (tpl as any).instruction || TEMPLATE_INSTRUCTIONS[tpl.id] || '',
        model: recommendedModel || w.model,
        scheduleType: (tpl as any).schedule_type || 'manual',
        scheduleValue: (tpl as any).schedule_value || '',
        selectedTools: (tpl as any).tools || [],
        memoryExtraction: (tpl as any).memory_extraction || UNIVERSAL_DEFAULTS.memoryExtraction,
        observationCompression: (tpl as any).observation_compression || UNIVERSAL_DEFAULTS.observationCompression,
        retrievalStrategy: (tpl as any).retrieval_strategy || UNIVERSAL_DEFAULTS.retrievalStrategy,
        taskDecomposition: (tpl as any).task_decomposition || UNIVERSAL_DEFAULTS.taskDecomposition,
        maxTurns: (tpl as any).max_turns || UNIVERSAL_DEFAULTS.maxTurns,
        temperature: (tpl as any).temperature ?? UNIVERSAL_DEFAULTS.temperature,
      }));
    } else {
      setWizard((w) => ({
        ...w,
        step: 2,
        templateId: '',
        templateData: null,
        name: '',
        instruction: '',
        model: recommendedModel || w.model,
        scheduleType: 'manual',
        scheduleValue: '',
        selectedTools: [],
        ...UNIVERSAL_DEFAULTS,
      }));
    }
  }

  async function handleLaunch() {
    if (!wizard.name.trim()) { toast.error('Name is required'); return; }
    setLaunching(true);
    try {
      const { type: apiScheduleType, value: apiScheduleValue } = normalizeAgentSchedule(
        wizard.scheduleType,
        wizard.scheduleValue,
      );

      const config: Record<string, unknown> = {
        schedule_type: apiScheduleType,
        schedule_value: apiScheduleValue || undefined,
        tools: wizard.selectedTools,
        learning_enabled: !!wizard.routerPolicy,
        memory_extraction: wizard.memoryExtraction,
        observation_compression: wizard.observationCompression,
        retrieval_strategy: wizard.retrievalStrategy,
        task_decomposition: wizard.taskDecomposition,
        max_turns: wizard.maxTurns,
        temperature: wizard.temperature,
      };
      if (wizard.budget) config.budget = parseFloat(wizard.budget);
      if (wizard.instruction.trim()) config.instruction = wizard.instruction.trim();
      if (wizard.model) config.model = wizard.model;
      if (wizard.routerPolicy) config.router_policy = wizard.routerPolicy;

      await createManagedAgent({
        name: wizard.name.trim(),
        template_id: wizard.templateId || undefined,
        config,
      });
      toast.success(`Agent "${wizard.name}" created`);
      onLaunched();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create agent');
    } finally {
      setLaunching(false);
    }
  }

  const formatScheduleLabel = (type: string, value: string) => {
    if (type === 'manual') return 'Manual (run on demand)';
    if (type === 'cron') return `Cron: ${value}`;
    if (type === 'interval') {
      const secs = parseInt(value, 10);
      if (secs >= 3600) return `Every ${secs / 3600}h`;
      if (secs >= 60) return `Every ${secs / 60}m`;
      return `Every ${secs}s`;
    }
    return type;
  };

  const hourLabel = (i: number) => (i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`);

  // ── Step 1: Template Selection ──
  if (wizard.step === 1) {
    return (
      <div className="tn-scrim z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-wizard-title"
          className="tn-dialog w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
          style={SURFACE_STATIONS}
        >
          <div className="flex justify-between items-start gap-4 mb-5">
            <h2 id="launch-wizard-title" className="text-[20px] leading-7 font-bold">New Agent — Choose Template</h2>
            <button onClick={onClose} className="tn-icon-btn" aria-label="Close" title="Close"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px" style={{ background: 'var(--color-border)', border: '1px solid var(--color-border)' }}>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => selectTemplate(tpl)}
                className="text-left p-4 flex flex-col items-start gap-2 cursor-pointer transition-colors bg-[var(--color-surface)] hover:bg-[var(--color-bg-tertiary)] focus-visible:bg-[var(--color-bg-tertiary)]"
              >
                <span className="flex items-center gap-2.5">
                  <LineBullet letter={bulletLetter(tpl.name)} size={24} />
                  <span className="font-semibold text-[15px]" style={{ color: 'var(--color-text)' }}>{tpl.name}</span>
                </span>
                <span className="text-[13px] leading-[18px]" style={{ color: 'var(--color-text-secondary)' }}>{tpl.description}</span>
                {(tpl as any).tools && (
                  <span className="flex flex-wrap gap-1 mt-1">
                    {((tpl as any).tools as string[]).slice(0, 4).map((t: string) => (
                      <span key={t} className="tn-chip tn-mono">{t}</span>
                    ))}
                    {((tpl as any).tools as string[]).length > 4 && (
                      <span className="tn-mono text-[12px] self-center px-1" style={{ color: 'var(--color-text-tertiary)' }}>+{((tpl as any).tools as string[]).length - 4}</span>
                    )}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => selectTemplate(null)}
              className={`text-left p-4 flex flex-col items-start gap-2 cursor-pointer transition-colors bg-[var(--color-surface)] hover:bg-[var(--color-bg-tertiary)] focus-visible:bg-[var(--color-bg-tertiary)] ${templates.length % 2 === 0 ? 'sm:col-span-2' : ''}`}
            >
              <span className="flex items-center gap-2.5">
                <LineBullet letter="C" size={24} />
                <span className="font-semibold text-[15px]" style={{ color: 'var(--color-text)' }}>Custom Agent</span>
              </span>
              <span className="text-[13px] leading-[18px]" style={{ color: 'var(--color-text-secondary)' }}>Start from scratch. Pick your own tools, schedule, and behavior.</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Configuration ──
  return (
    <div className="tn-scrim z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-wizard-title"
        className="tn-dialog w-full max-w-xl max-h-[85vh] overflow-y-auto p-6"
        style={SURFACE_STATIONS}
      >
        <div className="flex justify-between items-center gap-3 mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setWizard((w) => ({ ...w, step: 1 }))} className="tn-icon-btn shrink-0" aria-label="Back to templates" title="Back to templates"><ChevronLeft size={18} /></button>
            <h2 id="launch-wizard-title" className="text-[20px] leading-7 font-bold truncate">
              {wizard.templateData ? `New ${wizard.templateData.name}` : 'New Custom Agent'}
            </h2>
          </div>
          <button onClick={onClose} className="tn-icon-btn shrink-0" aria-label="Close" title="Close"><X size={18} /></button>
        </div>

        <div className="space-y-5">
          {/* Name */}
          <label className="block">
            <FieldLabel>Agent Name</FieldLabel>
            <input
              value={wizard.name}
              onChange={(e) => setWizard((w) => ({ ...w, name: e.target.value }))}
              placeholder="e.g. AI Research Tracker"
              className="tn-input"
            />
          </label>

          {/* Instruction */}
          <label className="block">
            <FieldLabel>What should this agent do?</FieldLabel>
            <textarea
              value={wizard.instruction}
              onChange={(e) => setWizard((w) => ({ ...w, instruction: e.target.value }))}
              placeholder="e.g. Monitor the latest research papers on reasoning and chain-of-thought in LLMs"
              rows={3}
              className="tn-textarea resize-none"
            />
            {wizard.instruction.includes('[') && (
              <span className="block text-[12px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Replace the [bracketed text] with your own values
              </span>
            )}
          </label>

          {/* Tools picker */}
          <ToolsPicker
            tools={availableTools}
            selected={wizard.selectedTools}
            onChange={(next) =>
              setWizard((w) => ({ ...w, selectedTools: next }))
            }
          />

          {/* Model + Schedule row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <FieldLabel>Intelligence</FieldLabel>
              <span className="flex items-center gap-2">
                <Station line={lineForModel(wizard.model)} state={wizard.model ? 'open' : 'unavailable'} />
                <select
                  value={wizard.model}
                  onChange={(e) => setWizard((w) => ({ ...w, model: e.target.value }))}
                  className="tn-select tn-mono min-w-0"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}{m.id === recommendedModel ? ' (recommended)' : ''}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <div>
              <label className="block">
                <FieldLabel>Schedule</FieldLabel>
                <select
                  value={wizard.scheduleType}
                  onChange={(e) => setWizard((w) => ({ ...w, scheduleType: e.target.value, scheduleValue: e.target.value === 'manual' ? '' : w.scheduleValue }))}
                  className="tn-select"
                >
                  <option value="manual">Manual (run on demand)</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="hourly">Every N hours</option>
                  <option value="cron">Custom (cron expression)</option>
                </select>
              </label>
              {wizard.scheduleType === 'daily' && (
                <select
                  aria-label="Hour"
                  value={(() => { const m = wizard.scheduleValue.match(/^0\s+(\d+)\s/); return m ? m[1] : '9'; })()}
                  onChange={(e) => setWizard((w) => ({ ...w, scheduleValue: `0 ${e.target.value} * * *` }))}
                  className="tn-select mt-2"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={String(i)}>{hourLabel(i)}</option>
                  ))}
                </select>
              )}
              {wizard.scheduleType === 'weekly' && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1">
                    {(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const).map((day, idx) => {
                      const dayNum = String(idx + 1);
                      const cronParts = wizard.scheduleValue.match(/\*\s+\*\s+(.+)$/);
                      const selectedDays = cronParts ? cronParts[1].split(',') : [];
                      const isSelected = selectedDays.includes(dayNum);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            const newDays = isSelected ? selectedDays.filter(d => d !== dayNum) : [...selectedDays, dayNum].sort();
                            const hourMatch = wizard.scheduleValue.match(/^0\s+(\d+)\s/);
                            const hour = hourMatch ? hourMatch[1] : '9';
                            setWizard((w) => ({ ...w, scheduleValue: newDays.length > 0 ? `0 ${hour} * * ${newDays.join(',')}` : '' }));
                          }}
                          className="flex-1 h-8 text-[12px] font-medium cursor-pointer transition-colors"
                          style={{
                            borderRadius: 2,
                            background: isSelected ? 'var(--action)' : 'transparent',
                            color: isSelected ? 'var(--on-action)' : 'var(--color-text-secondary)',
                            border: `1px solid ${isSelected ? 'var(--action)' : 'var(--color-border)'}`,
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <select
                    aria-label="Hour"
                    value={(() => { const m = wizard.scheduleValue.match(/^0\s+(\d+)\s/); return m ? m[1] : '9'; })()}
                    onChange={(e) => {
                      const cronParts = wizard.scheduleValue.match(/\*\s+\*\s+(.+)$/);
                      const days = cronParts ? cronParts[1] : '1';
                      setWizard((w) => ({ ...w, scheduleValue: `0 ${e.target.value} * * ${days}` }));
                    }}
                    className="tn-select"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>{hourLabel(i)}</option>
                    ))}
                  </select>
                </div>
              )}
              {wizard.scheduleType === 'hourly' && (
                <div className="flex items-center gap-2 mt-2 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Every</span>
                  <input
                    type="number" min="1" max="24"
                    aria-label="Hours between runs"
                    value={(() => { const secs = parseInt(wizard.scheduleValue || '0', 10); return secs > 0 ? Math.round(secs / 3600) : 1; })()}
                    onChange={(e) => {
                      const hrs = Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1));
                      setWizard((w) => ({ ...w, scheduleValue: String(hrs * 3600) }));
                    }}
                    className="tn-input tn-mono text-center"
                    style={{ width: 64 }}
                  />
                  <span>hours</span>
                </div>
              )}
              {wizard.scheduleType === 'cron' && (
                <input
                  aria-label="Cron expression"
                  value={wizard.scheduleValue}
                  onChange={(e) => setWizard((w) => ({ ...w, scheduleValue: e.target.value }))}
                  placeholder="0 9 * * *"
                  className="tn-input tn-mono mt-2"
                />
              )}
            </div>
          </div>

          {/* Tools tags */}
          {wizard.selectedTools.length > 0 && (
            <div>
              <FieldLabel>
                Tools <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>(from template)</span>
              </FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {wizard.selectedTools.map((t) => (
                  <span key={t} className="tn-chip tn-mono">
                    <Station line="tools" size={10} state="current" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Advanced Settings */}
          <details className="group" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
            <summary className="py-3 cursor-pointer text-[14px] font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden" style={{ color: 'var(--color-text)' }}>
              <ChevronRight size={14} className="group-open:rotate-90 transition-transform duration-150" style={{ color: 'var(--color-text-tertiary)' }} />
              Advanced Settings <span className="text-[12px] font-normal" style={{ color: 'var(--color-text-tertiary)' }}>(optional)</span>
            </summary>
            <div className="pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <label className="block">
                <FieldLabel>Memory Extraction<Tooltip text="How the agent remembers context between runs" /></FieldLabel>
                <select value={wizard.memoryExtraction} onChange={(e) => setWizard((w) => ({ ...w, memoryExtraction: e.target.value }))} className="tn-select">
                  <option value="structured_json">Structured JSON</option>
                  <option value="causality_graph">Causality Graph</option>
                  <option value="scratchpad">Scratchpad</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="block">
                <FieldLabel>Observation Compression<Tooltip text="How the agent summarizes long tool outputs" /></FieldLabel>
                <select value={wizard.observationCompression} onChange={(e) => setWizard((w) => ({ ...w, observationCompression: e.target.value }))} className="tn-select">
                  <option value="summarize">Summarize</option>
                  <option value="truncate">Truncate</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="block">
                <FieldLabel>Retrieval Strategy<Tooltip text="How the agent searches your knowledge base" /></FieldLabel>
                <select value={wizard.retrievalStrategy} onChange={(e) => setWizard((w) => ({ ...w, retrievalStrategy: e.target.value }))} className="tn-select">
                  <option value="sqlite">BM25 (SQLite FTS5)</option>
                  <option value="hybrid">Hybrid (BM25 + Semantic)</option>
                  <option value="colbert">ColBERTv2</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="block">
                <FieldLabel>Task Decomposition<Tooltip text="How the agent breaks complex tasks into steps" /></FieldLabel>
                <select value={wizard.taskDecomposition} onChange={(e) => setWizard((w) => ({ ...w, taskDecomposition: e.target.value }))} className="tn-select">
                  <option value="hierarchical">Hierarchical</option>
                  <option value="phased">Phased</option>
                  <option value="monolithic">Monolithic</option>
                </select>
              </label>
              <label className="block">
                <FieldLabel>Max Turns</FieldLabel>
                <input type="number" value={wizard.maxTurns} onChange={(e) => setWizard((w) => ({ ...w, maxTurns: parseInt(e.target.value, 10) || 25 }))}
                  className="tn-input tn-mono" />
              </label>
              <label className="block">
                <FieldLabel>Temperature</FieldLabel>
                <input type="number" step="0.1" min="0" max="2" value={wizard.temperature}
                  onChange={(e) => setWizard((w) => ({ ...w, temperature: parseFloat(e.target.value) || 0.3 }))}
                  className="tn-input tn-mono" />
              </label>
              <label className="block">
                <FieldLabel>Budget ($)</FieldLabel>
                <input type="number" step="0.01" value={wizard.budget} onChange={(e) => setWizard((w) => ({ ...w, budget: e.target.value }))}
                  placeholder="Unlimited"
                  className="tn-input tn-mono" />
              </label>
              <label className="block">
                <FieldLabel>Schedule Type</FieldLabel>
                <select value={wizard.scheduleType} onChange={(e) => setWizard((w) => ({ ...w, scheduleType: e.target.value, scheduleValue: e.target.value === 'manual' ? '' : w.scheduleValue }))}
                  className="tn-select">
                  <option value="manual">Manual</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="hourly">Every N hours</option>
                  <option value="cron">Custom (cron)</option>
                </select>
              </label>
            </div>
          </details>

          {/* Launch */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="tn-btn">
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              disabled={launching || !wizard.name.trim()}
              className="tn-btn tn-btn-primary flex-1"
            >
              {launching ? 'Creating...' : 'Launch Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overflow menu
// ---------------------------------------------------------------------------

function OverflowMenu({
  agentId,
  onDelete,
}: {
  agentId: string;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="tn-icon-btn"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="tn-panel tn-rule-top absolute right-0 top-9 z-20 py-1 min-w-[140px]">
          <button
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(agentId);
              setOpen(false);
            }}
            className="w-full text-left px-3 h-8 text-[13px] cursor-pointer flex items-center gap-2 transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: 'var(--fail)' }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent List Card
// ---------------------------------------------------------------------------

function AgentCard({
  agent,
  onClick,
  onPause,
  onResume,
  onRun,
  onRecover,
  onDelete,
  onChat,
  onEdit,
}: {
  agent: ManagedAgent;
  onClick: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRun: (id: string) => void;
  onRecover: (id: string) => void;
  onDelete: (id: string) => void;
  onChat: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const canPause = agent.status === 'running' || agent.status === 'idle';
  const canResume = agent.status === 'paused';
  const canRecover = agent.status === 'error' || agent.status === 'stalled' || agent.status === 'needs_attention';

  const line = agentLine(agent);
  const model = (agent.config?.model as string) || '';
  const { type: scheduleType } = getAgentSchedule(agent);
  const isManual = !scheduleType || scheduleType === 'manual';
  const maxCost = agent.config?.max_cost as number;
  const budgetRatio = maxCost > 0 ? (agent.total_cost ?? 0) / maxCost : 0;
  const tokens = agent.total_tokens ?? (agent.input_tokens ?? 0) + (agent.output_tokens ?? 0);

  return (
    <li
      onClick={onClick}
      className="grid gap-x-8 gap-y-4 px-3 py-4 cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)] lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)_200px_auto] lg:items-center"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {/* Identity: the agent's bullet in its line colour, name, status, model */}
      <div className="flex items-start gap-3 min-w-0">
        <LineBullet letter={bulletLetter(agent.name)} line={line} size={28} />
        <div className="min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="block max-w-full truncate text-left text-[15px] leading-5 font-semibold cursor-pointer hover:underline underline-offset-4"
            style={{ color: 'var(--color-text)' }}
          >
            {agent.name}
          </button>
          <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap min-w-0">
            <StatusBadge status={agent.status} line={line} />
            {model && (
              <span className="tn-mono text-[12px] truncate min-w-0" style={{ color: 'var(--color-text-tertiary)' }}>{model}</span>
            )}
          </div>
        </div>
      </div>

      {/* Route: last run (filled) to the schedule (open) on the agent's line */}
      <div className="min-w-0">
        <div className="flex items-center h-[14px]">
          <Station line={line} state={agent.last_run_at ? 'current' : 'unavailable'} className="relative z-[1]" />
          <span aria-hidden="true" className="flex-1 h-[5px] -mx-0.5" style={{ background: lineColor(line) }} />
          <Station line={line} state={isManual ? 'unavailable' : 'open'} className="relative z-[1]" />
        </div>
        <div className="flex justify-between gap-4 mt-1.5 text-[12px] leading-4">
          <span className="min-w-0">
            <span className="block text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Last run</span>
            <span className="block tn-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>{formatRelativeTime(agent.last_run_at)}</span>
          </span>
          <span className="min-w-0 text-right">
            <span className="block text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Schedule</span>
            <span className="block truncate" style={{ color: 'var(--color-text-secondary)' }}>{formatAgentSchedule(agent)}</span>
          </span>
        </div>
        {maxCost > 0 && (
          <div className="mt-2.5">
            <div className="h-[5px]" style={{ background: 'var(--color-bg-tertiary)' }}>
              <div
                className="h-full transition-[width] duration-200 ease-out"
                style={{
                  width: `${Math.min(100, budgetRatio * 100)}%`,
                  background: budgetRatio > 0.9 ? 'var(--fail)' : lineColor(line),
                }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[11px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>
              <span>Budget</span>
              <span className="tn-mono" style={{ color: budgetRatio > 0.9 ? 'var(--fail)' : 'var(--color-text-secondary)' }}>
                {formatCost(agent.total_cost)} / ${maxCost.toFixed(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Figures */}
      <dl className="grid grid-cols-3 gap-3">
        {([
          ['Runs', String(agent.total_runs ?? 0)],
          ['Cost', formatCost(agent.total_cost)],
          ['Tokens', tokens.toLocaleString()],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex flex-col min-w-0">
            <dt className="order-2 text-[11px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>{label}</dt>
            <dd className="order-1 tn-mono text-[13px] leading-5 truncate" style={{ color: 'var(--color-text)' }}>{value}</dd>
          </div>
        ))}
      </dl>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-wrap lg:justify-end" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => { e.stopPropagation(); onChat(agent.id); }}
          className="tn-icon-btn"
          title="Chat with agent"
          aria-label="Chat with agent"
        >
          <MessageSquare size={15} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(agent.id); }}
          className="tn-icon-btn"
          title="Edit agent"
          aria-label="Edit agent"
        >
          <Pencil size={15} />
        </button>
        {canPause && (
          <button onClick={() => onPause(agent.id)} className="tn-icon-btn" title="Pause" aria-label="Pause">
            <Pause size={15} />
          </button>
        )}
        {canResume && (
          <button onClick={() => onResume(agent.id)} className="tn-icon-btn" title="Resume" aria-label="Resume">
            <Play size={15} />
          </button>
        )}
        {canRecover && (
          <button onClick={() => onRecover(agent.id)} className="tn-btn tn-btn-sm" title="Recover agent">
            <AlertTriangle size={13} style={{ color: 'var(--fail)' }} /> Recover
          </button>
        )}
        <button onClick={() => onRun(agent.id)} className="tn-btn tn-btn-sm" title="Run now">
          <Zap size={13} /> Run Now
        </button>
        <OverflowMenu agentId={agent.id} onDelete={onDelete} />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Detail view — Configuration grid with editable model
// ---------------------------------------------------------------------------

function AgentInstructionSection({ agent, onAgentUpdated }: { agent: ManagedAgent; onAgentUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const currentInstruction = (agent.config?.instruction as string) || '';

  async function save() {
    try {
      const newConfig = { ...(agent.config || {}), instruction: draft.trim() };
      await updateManagedAgent(agent.id, { config: newConfig });
      onAgentUpdated();
    } catch { /* ignore */ }
    setEditing(false);
  }

  return (
    <section>
      <SectionHeading
        actions={!editing && (
          <button
            onClick={() => { setDraft(currentInstruction); setEditing(true); }}
            className="tn-btn tn-btn-sm tn-btn-ghost"
          >
            <Pencil size={13} /> Edit
          </button>
        )}
      >
        Instruction
      </SectionHeading>
      <div className="mt-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              aria-label="Instruction"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="tn-textarea resize-none"
            />
            <div className="flex gap-2">
              <button onClick={save} className="tn-btn tn-btn-sm tn-btn-primary">Save</button>
              <button onClick={() => setEditing(false)} className="tn-btn tn-btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-[15px] leading-[22px] max-w-[72ch] whitespace-pre-wrap" style={{ color: currentInstruction ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
            {currentInstruction || '(No instruction set — click Edit to add one)'}
          </p>
        )}
      </div>
    </section>
  );
}

function AgentConfigGrid({ agent, onAgentUpdated }: { agent: ManagedAgent; onAgentUpdated: () => void }) {
  const [editingModel, setEditingModel] = useState(false);
  const [changingModel, setChangingModel] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const currentModel = (agent.config?.model as string) || '(default)';

  // Model availability status: 'available' | 'unavailable' | 'unknown'
  const [modelAvailable, setModelAvailable] = useState<'available' | 'unavailable' | 'unknown'>('unknown');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function checkModel() {
      try {
        // Ask the backend which models are installed rather than hitting
        // Ollama directly from the browser: the backend always knows where
        // Ollama lives (incl. remote) and there's no cross-origin/CORS issue,
        // which is what made the check spuriously report "Not available".
        const installed = (await fetchModels()).map((m) => m.id);
        if (cancelled) return;
        setOllamaModels(installed);
        if (currentModel === '(default)') {
          setModelAvailable(installed.length > 0 ? 'available' : 'unknown');
        } else {
          const isInstalled = installed.some(
            (n) => n === currentModel || n.startsWith(currentModel + ':') || currentModel.startsWith(n.split(':')[0])
          );
          setModelAvailable(isInstalled ? 'available' : 'unavailable');
        }
      } catch {
        if (!cancelled) setModelAvailable('unknown');
      }
    }
    checkModel();
    return () => { cancelled = true; };
  }, [currentModel]);

  async function startEditingModel() {
    try {
      const fetched = (await fetchModels()).map((m) => m.id);
      setModels(fetched);
      // Same backend list drives both the dropdown and the availability dots.
      setOllamaModels(fetched);
    } catch { /* ignore */ }
    setEditingModel(true);
  }

  function isModelInstalled(modelId: string): boolean {
    return ollamaModels.some(
      (n) => n === modelId || n.startsWith(modelId + ':') || modelId.startsWith(n.split(':')[0])
    );
  }

  async function changeModel(newModel: string) {
    setChangingModel(true);
    try {
      const newConfig = { ...(agent.config || {}), model: newModel };
      await updateManagedAgent(agent.id, { config: newConfig });
      onAgentUpdated();
      toast.success(`Model changed to ${newModel}`);
    } catch { /* ignore */ }
    setEditingModel(false);
    setChangingModel(false);
  }

  const modelLine = lineForModel(currentModel === '(default)' ? '' : currentModel);
  const modelState: StationState = modelAvailable === 'available'
    ? 'current'
    : modelAvailable === 'unavailable'
      ? 'failed'
      : 'unavailable';

  const rows: [string, React.ReactNode][] = [
    ['Intelligence', editingModel ? (
      changingModel ? (
        <span className="text-[14px]" style={{ color: 'var(--color-text-tertiary)' }}>Switching model...</span>
      ) : (
        <select
          autoFocus
          aria-label="Intelligence"
          defaultValue={currentModel}
          onChange={(e) => changeModel(e.target.value)}
          onBlur={() => setEditingModel(false)}
          className="tn-select tn-mono"
          style={{ maxWidth: 320 }}
        >
          {models.map((m) => {
            const installed = isModelInstalled(m);
            return (
              <option key={m} value={m} style={!installed ? { color: 'var(--color-text-tertiary)' } : undefined}>
                {m}{!installed ? ' (not installed)' : ''}
              </option>
            );
          })}
        </select>
      )
    ) : (
      <span className="flex items-center gap-2 flex-wrap min-w-0">
        <Station
          line={modelLine}
          state={modelState}
          label={
            modelAvailable === 'available' ? 'Model running'
              : modelAvailable === 'unavailable' ? 'Model not available'
                : 'Could not check model status'
          }
        />
        <span className="tn-mono truncate" style={{ color: 'var(--color-text)' }}>{currentModel}</span>
        {modelAvailable === 'unavailable' && (
          <StatusText tone="fail">Not available</StatusText>
        )}
        <button onClick={startEditingModel} className="tn-btn tn-btn-sm tn-btn-ghost">
          Change
        </button>
      </span>
    )],
    ['Agent Type', <span key="at" className="tn-mono">{agent.agent_type}</span>],
    ['Schedule', <span key="sc">{formatAgentSchedule(agent)}</span>],
    ['Last Run', <span key="lr" className="tn-mono">{formatRelativeTime(agent.last_run_at)}</span>],
    ['Budget', <span key="bg" className="tn-mono">{agent.budget ? formatCost(agent.budget) : 'Unlimited'}</span>],
    ['Learning', <span key="le">{agent.learning_enabled ? 'Enabled' : 'Disabled'}</span>],
  ];

  return (
    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
      {rows.map(([label, value]) => (
        <div key={label as string} className="flex gap-3 items-center text-[14px] min-h-[44px] py-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <dt className="shrink-0" style={{ color: 'var(--color-text-secondary)', width: 104 }}>{label}</dt>
          <dd className="min-w-0 flex-1" style={{ color: 'var(--color-text)' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Detail view — Interact tab
// ---------------------------------------------------------------------------

/** One entry in the live activity feed assembled from agent events. */
type LiveItem =
  | { kind: 'note'; id: string; label: string }
  | { kind: 'tool'; id: string; tool: ToolCallInfo };

/** Convert a persisted trace step into a ToolCallInfo for ToolCallCard. */
function stepToToolCall(
  step: AgentTraceDetail['steps'][number],
  idx: number,
): ToolCallInfo {
  const input = (step.input ?? {}) as { tool?: string; args?: unknown };
  const out = step.output as unknown;
  const result =
    typeof out === 'string'
      ? out
      : out && typeof out === 'object' && 'result' in out
        ? String((out as { result: unknown }).result ?? '')
        : out != null
          ? JSON.stringify(out)
          : '';
  const args = input.args;
  return {
    id: `step-${idx}`,
    tool: input.tool || step.step_type || 'step',
    arguments:
      typeof args === 'string' ? args : args != null ? JSON.stringify(args) : '',
    status: 'success',
    result,
    latency: step.duration ? step.duration * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Interact tab — trace viewer (top) + follow-up chat (bottom).
//
// The chat input doesn't open a side-channel chat; it triggers a real ad-hoc
// agent run (execute_tick) with the user's question as input. The trace area
// shows that run live (tick + tool calls over the events WebSocket) and, when
// idle, the last run's trace steps plus the agent's resulting findings — so
// users can interrogate the agent about its work ("tell me more about X").
// ---------------------------------------------------------------------------
function InteractTab({ agentId, agentStatus, onRunStateChange }: { agentId: string; agentStatus: string; onRunStateChange?: () => void }) {
  const [agent, setAgent] = useState<ManagedAgent | null>(null);
  const [activity, setActivity] = useState('');
  const [running, setRunning] = useState(agentStatus === 'running');
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);
  const [lastTrace, setLastTrace] = useState<AgentTraceDetail | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [question, setQuestion] = useState(''); // question driving the current/last run
  const [elapsedMs, setElapsedMs] = useState(0);

  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const bottomRef = useRef<HTMLDivElement>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Load idle snapshot: agent record (status + findings) and the latest trace.
  const loadIdle = useCallback(async () => {
    try {
      const a = await fetchManagedAgent(agentId);
      setAgent(a);
      setActivity(a.current_activity || '');
      try {
        const traces = await fetchAgentTraces(agentId, 1);
        if (traces.length > 0) {
          const detail = await fetchAgentTrace(agentId, traces[0].id);
          setLastTrace(detail);
        }
      } catch {
        /* trace store may be empty */
      }
    } catch {
      /* ignore */
    }
  }, [agentId]);

  useEffect(() => {
    loadIdle();
  }, [loadIdle]);

  // Tick the elapsed timer while running.
  useEffect(() => {
    if (!running) {
      clearTimer();
      return;
    }
    if (!startRef.current) startRef.current = Date.now();
    timerRef.current = setInterval(
      () => setElapsedMs(Date.now() - startRef.current),
      100,
    );
    return clearTimer;
  }, [running, clearTimer]);

  const finishRun = useCallback(() => {
    setRunning(false);
    startRef.current = 0;
    clearTimer();
    // Give the backend a beat to persist summary_memory + trace, then refresh
    // both this tab and the parent (so the detail/list status badge flips back
    // from "running" to "idle" without waiting for the slow background poll).
    setTimeout(() => {
      loadIdle();
      onRunStateChange?.();
    }, 500);
  }, [clearTimer, loadIdle, onRunStateChange]);

  // Live trace: assemble events from the agent events WebSocket.
  const onEvent = useCallback(
    (ev: AgentEvent) => {
      const data = ev.data || {};
      switch (ev.type) {
        case 'agent_tick_start': {
          startRef.current = Date.now();
          setElapsedMs(0);
          setRunning(true);
          setErrorMsg('');
          setLiveItems([{ kind: 'note', id: `start-${ev.timestamp}`, label: 'Run started' }]);
          break;
        }
        case 'tool_call_start': {
          const id = `tc-${ev.timestamp}-${Math.random().toString(36).slice(2, 6)}`;
          const args = data.arguments;
          const tc: ToolCallInfo = {
            id,
            tool: String(data.tool || 'tool'),
            arguments:
              typeof args === 'string' ? args : args != null ? JSON.stringify(args) : '',
            status: 'running',
          };
          setLiveItems((prev) => [...prev, { kind: 'tool', id, tool: tc }]);
          break;
        }
        case 'tool_call_end': {
          setLiveItems((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              const it = next[i];
              if (
                it.kind === 'tool' &&
                it.tool.tool === String(data.tool) &&
                it.tool.status === 'running'
              ) {
                next[i] = {
                  ...it,
                  tool: {
                    ...it.tool,
                    status: data.success === false ? 'error' : 'success',
                    result:
                      typeof data.result === 'string' ? data.result : it.tool.result,
                    latency:
                      typeof data.latency === 'number'
                        ? data.latency * 1000
                        : it.tool.latency,
                  },
                };
                break;
              }
            }
            return next;
          });
          break;
        }
        case 'agent_tick_end':
        case 'agent_tick_error': {
          if (ev.type === 'agent_tick_error') {
            setErrorMsg(String(data.error || 'The run failed.'));
          }
          finishRun();
          break;
        }
      }
    },
    [finishRun],
  );

  useAgentEvents(agentId, onEvent, [
    'agent_tick_start',
    'tool_call_start',
    'tool_call_end',
    'agent_tick_end',
    'agent_tick_error',
  ]);

  // Fallback poll — WS is primary, but this catches missed tick_end events and
  // runs started elsewhere (e.g. the scheduler or the Overview "Run" button).
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const a = await fetchManagedAgent(agentId);
        setActivity(a.current_activity || '');
        if (a.status === 'running' && !runningRef.current) {
          setRunning(true);
        } else if (a.status !== 'running' && runningRef.current) {
          finishRun();
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [agentId, finishRun]);

  // Keep pinned to the newest live item.
  useEffect(() => {
    if (running) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveItems, running]);

  async function handleAsk() {
    const q = input.trim();
    if (!q || running || sending) return;
    setInput('');
    setQuestion(q);
    setErrorMsg('');
    setSending(true);
    setLiveItems([{ kind: 'note', id: 'queued', label: 'Starting run…' }]);
    startRef.current = Date.now();
    setElapsedMs(0);
    try {
      // immediate, non-streamed → triggers a real agent run that consumes the
      // question as input. tick_start over the WS confirms; poll is the backstop.
      await askAgent(agentId, q);
      setRunning(true);
      onRunStateChange?.(); // flip the parent status badge to "running" now
    } catch {
      setErrorMsg('Could not start the agent run.');
      setLiveItems([]);
    } finally {
      setSending(false);
    }
  }

  const isBusy = running || sending;
  const findings = agent?.summary_memory?.trim() || '';
  const traceSteps = lastTrace?.steps ?? [];
  const model = (agent?.config?.model as string) || '';

  // The run drawn as a route: this device, each tool call, then the model.
  const shownTools: ToolCallInfo[] = isBusy
    ? liveItems.flatMap((it) => (it.kind === 'tool' ? [it.tool] : []))
    : traceSteps.map((s, i) => stepToToolCall(s, i));
  const traceFailed = !isBusy && !!lastTrace && lastTrace.outcome !== 'success';
  const routeStops: RouteStop[] = isBusy || lastTrace
    ? [
        { id: 'device', kind: 'device', line: 'local', label: 'This device' },
        ...shownTools.map((tc): RouteStop => ({
          id: tc.id,
          kind: 'tool',
          line: 'tools',
          label: tc.tool,
          detail: [tc.status, tc.latency != null ? formatMs(tc.latency) : ''].filter(Boolean).join(' · '),
          state: tc.status === 'error' ? 'failed' : tc.status === 'running' ? 'current' : undefined,
          rows: [
            { label: 'Tool', value: tc.tool },
            { label: 'Status', value: tc.status },
            ...(tc.latency != null ? [{ label: 'Latency', value: formatMs(tc.latency) }] : []),
          ],
        })),
        ...(model
          ? [{
              id: 'model',
              kind: 'model' as const,
              line: lineForModel(model),
              label: model,
              detail: !isBusy && lastTrace ? `${lastTrace.outcome} · ${lastTrace.duration.toFixed(1)}s` : undefined,
              state: traceFailed ? ('failed' as const) : undefined,
              rows: !isBusy && lastTrace
                ? [
                    { label: 'Outcome', value: lastTrace.outcome },
                    { label: 'Duration', value: `${lastTrace.duration.toFixed(1)}s` },
                    { label: 'Steps', value: String(lastTrace.steps.length) },
                  ]
                : undefined,
            }]
          : []),
      ]
    : [];

  return (
    <div className="flex flex-col" style={{ minHeight: 360 }}>
      {/* ── Trace area header ──────────────────────────────── */}
      <SectionHeading
        actions={
          <span className="flex items-center gap-2 tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            {isBusy ? (
              <>
                <Station line={model ? lineForModel(model) : 'local'} state="current" size={12} />
                Running{elapsedMs > 0 ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : ''}
              </>
            ) : (
              <>
                {agent?.last_run_at
                  ? `Last run ${new Date(agent.last_run_at * 1000).toLocaleString()}`
                  : 'Idle'}
                {lastTrace && (
                  <span style={{ color: traceFailed ? 'var(--fail)' : undefined }}>{` · ${lastTrace.outcome}`}</span>
                )}
              </>
            )}
          </span>
        }
      >
        Activity trace
      </SectionHeading>

      {/* ── Trace area body ────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto mt-3 p-4 space-y-4"
        style={{
          ...SURFACE_STATIONS,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          maxHeight: 'calc(100vh - 360px)',
          minHeight: 200,
        }}
      >
        {question && (
          <div className="text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Question:</span> {question}
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="flex items-start gap-2 text-[14px] pt-2" style={{ borderTop: 'var(--rule-bar) solid var(--fail)', color: 'var(--fail)' }}>
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}

        {routeStops.length > 0 && (
          <div className="pb-1">
            <RouteStrip stops={routeStops} live={isBusy} label="Run route" />
          </div>
        )}

        {isBusy ? (
          /* LIVE view — current tick */
          <>
            {liveItems.map((it) =>
              it.kind === 'tool' ? (
                <ToolCallCard key={it.id} toolCall={it.tool} />
              ) : (
                <div key={it.id} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <Station line="local" state="open" size={10} />
                  {it.label}
                </div>
              ),
            )}
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              <Station line={model ? lineForModel(model) : 'local'} state="current" size={10} />
              {activity || 'Agent is working…'}
            </div>
          </>
        ) : (
          /* IDLE view — last run's trace + findings */
          <>
            {traceSteps.length > 0 && (
              <div className="space-y-2">
                {traceSteps.map((s, i) => (
                  <ToolCallCard key={i} toolCall={stepToToolCall(s, i)} />
                ))}
              </div>
            )}
            {findings ? (
              <div className="pt-3" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                <div className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Result
                </div>
                <div className="prose prose-sm max-w-[72ch]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{findings}</ReactMarkdown>
                </div>
              </div>
            ) : (
              traceSteps.length === 0 && (
                <div className="text-[14px] text-center py-10" style={{ color: 'var(--color-text-tertiary)' }}>
                  No runs yet. Ask a question below to run the agent.
                </div>
              )
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Follow-up chat input ───────────────────────────── */}
      <div
        className="mt-4 border-2 border-[var(--color-input-border)] transition-colors focus-within:border-[var(--action)]"
        style={{ background: 'var(--color-input-bg)', borderRadius: 2 }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          aria-label="Ask a follow-up"
          placeholder={isBusy ? 'Agent is running…' : "Ask a follow-up about this agent's work…"}
          disabled={isBusy}
          className="block w-full px-3 pt-3 pb-1 bg-transparent outline-none resize-none text-[15px] leading-[22px] disabled:cursor-not-allowed"
          style={{ color: 'var(--color-text)', minHeight: 64, opacity: isBusy ? 0.6 : 1 }}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <span className="text-[12px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>
            Sends your question as an ad-hoc run — results appear in the trace above.
          </span>
          <button
            onClick={handleAsk}
            disabled={isBusy || !input.trim()}
            className="tn-btn tn-btn-primary shrink-0"
          >
            <Send size={14} />
            {isBusy ? 'Running' : 'Ask'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channels tab component (data sources)
// ---------------------------------------------------------------------------

function ChannelsTab({ agentId }: { agentId: string }) {
  const [connectors, setConnectors] = useState<
    Array<{ connector_id: string; display_name: string; connected: boolean; chunks: number }>
  >([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // suppress unused var – agentId reserved for future per-agent source binding
  void agentId;

  const loadConnectors = useCallback(() => {
    listConnectors()
      .then((list) =>
        setConnectors(
          list.map((c) => ({
            connector_id: c.connector_id,
            display_name: c.display_name,
            connected: c.connected,
            chunks: (c as any).chunks || 0,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConnectors();
    // Poll every 10s to catch background OAuth completions
    const interval = setInterval(loadConnectors, 10000);
    return () => clearInterval(interval);
  }, [loadConnectors]);

  const handleConnect = async (id: string, req: ConnectRequest) => {
    setLoading(true);
    try {
      await connectSource(id, req);
      setExpandedId(null);
      // Poll for connection status (OAuth flow runs in background thread)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        await loadConnectors();
        // Check if this connector is now connected
        const updated = await listConnectors();
        const target = updated.find((c) => c.connector_id === id);
        if (target?.connected) break;
      }
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  const connected = connectors.filter((c) => c.connected);
  const notConnected = connectors.filter((c) => !c.connected);

  // Merge with SOURCE_CATALOG for icons/descriptions
  const getMeta = (id: string) =>
    SOURCE_CATALOG.find((s) => s.connector_id === id);

  const all = [...connected, ...notConnected];

  const renderSteps = (meta: (typeof SOURCE_CATALOG)[number] | undefined) =>
    meta?.steps && (
      <ol className="list-none mb-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        {meta.steps.map((step, i) => (
          <li key={i} className="flex gap-3 py-2 text-[13px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="tn-mono text-[11px] leading-5 shrink-0" style={{ color: 'var(--color-text-tertiary)', width: 48 }}>
              STEP {i + 1}
            </span>
            <span className="min-w-0 leading-5">
              <span className="block">{step.label}</span>
              {step.url && (
                <a
                  href={step.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] underline underline-offset-2"
                  style={{ color: 'var(--action)' }}
                >
                  {step.urlLabel || 'Open'} <ArrowUpRight size={12} />
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="py-2">
      <p className="text-[14px] mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Data sources your agent can search across
      </p>

      {all.length > 0 && (
        <ul className="list-none max-w-3xl" aria-label="Data sources">
          {all.map((c, idx) => {
            const meta = getMeta(c.connector_id);
            const isOpen = expandedId === c.connector_id;
            const first = idx === 0;
            const last = idx === all.length - 1;

            if (c.connected) {
              const unit = meta?.unitLabel || 'items';
              return (
                <RailItem key={c.connector_id} line="data" state="current" first={first} last={last}>
                  <div className="flex items-center gap-3 py-3 min-h-[44px]">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] leading-5 font-semibold truncate">{c.display_name}</div>
                      <div className="tn-mono text-[12px] leading-4" style={{ color: 'var(--color-text-secondary)' }}>
                        {c.chunks > 0
                          ? `${c.chunks.toLocaleString()} ${unit}`
                          : 'Connected — no data synced yet'}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isOpen ? null : c.connector_id)}
                      className="tn-btn tn-btn-sm"
                    >
                      {isOpen ? 'Cancel' : 'Reconnect'}
                    </button>
                  </div>
                  {isOpen && meta?.steps && (
                    <div className="pb-4">
                      <p className="text-[13px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                        Re-enter credentials to reconnect this source.
                      </p>
                      {renderSteps(meta)}
                      {meta.inputFields && (
                        <InlineConnectForm
                          fields={meta.inputFields}
                          loading={loading}
                          onSubmit={(req) => handleConnect(c.connector_id, req)}
                        />
                      )}
                    </div>
                  )}
                </RailItem>
              );
            }

            return (
              <RailItem key={c.connector_id} line="data" state="open" first={first} last={last}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpandedId(isOpen ? null : c.connector_id)}
                  className="w-full flex items-center gap-3 py-3 min-h-[44px] text-left cursor-pointer group"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] leading-5 font-semibold truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {c.display_name}
                    </span>
                    <span className="block text-[12px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>
                      Not connected
                    </span>
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium group-hover:underline underline-offset-4"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {isOpen ? <><X size={13} /> Close</> : <><Plus size={13} /> Add</>}
                  </span>
                </button>

                {/* Inline setup panel */}
                {isOpen && meta?.steps && (
                  <div className="pb-4">
                    {renderSteps(meta)}
                    {meta.inputFields && (
                      <InlineConnectForm
                        fields={meta.inputFields}
                        loading={loading}
                        onSubmit={(req) =>
                          handleConnect(c.connector_id, req)
                        }
                      />
                    )}
                    <div className="flex items-center gap-1.5 text-[12px] mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                      <Lock size={12} /> Read-only access · No data leaves your device
                    </div>
                  </div>
                )}
              </RailItem>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InlineConnectForm({
  fields,
  loading,
  onSubmit,
}: {
  fields: Array<{ name: string; placeholder: string; type?: string }>;
  loading: boolean;
  onSubmit: (req: ConnectRequest) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const update = (name: string, value: string) =>
    setInputs((p) => ({ ...p, [name]: value }));

  const allFilled = fields.every((f) => inputs[f.name]?.trim());

  const submit = () => {
    const req: ConnectRequest = {};
    for (const f of fields) {
      if (f.name === 'email') req.email = inputs.email;
      else if (f.name === 'password') req.password = inputs.password;
      else if (f.name === 'token') req.token = inputs.token;
      else if (f.name === 'path') req.path = inputs.path;
    }
    if (req.email && req.password) {
      req.token = `${req.email}:${req.password}`;
      req.code = req.token;
    }
    if (req.token && !req.code) req.code = req.token;
    onSubmit(req);
  };

  return (
    <div className="space-y-2 max-w-md">
      {fields.map((f) => (
        <input
          key={f.name}
          value={inputs[f.name] || ''}
          onChange={(e) => update(f.name, e.target.value)}
          placeholder={f.placeholder}
          aria-label={f.placeholder}
          type={f.type || 'text'}
          className="tn-input"
        />
      ))}
      <button
        onClick={submit}
        disabled={loading || !allFilled}
        className="tn-btn tn-btn-primary w-full"
      >
        {loading ? 'Connecting...' : 'Connect'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messaging tab component
// ---------------------------------------------------------------------------

interface ChannelField {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  required?: boolean;
}

interface MessagingChannelConfig {
  type: string;
  name: string;
  icon: string;
  description: string;
  setupSteps: string[];
  fields: ChannelField[];
  activeLabel: (cfg: Record<string, unknown>) => string;
  howToUse: (cfg: Record<string, unknown>) => string;
}

const MESSAGING_CHANNELS: MessagingChannelConfig[] = [
  // SendBlue (iMessage + SMS) is handled by the dedicated SendBlueWizard above.
  // These are the other supported channels.
  {
    type: 'slack',
    name: 'Slack',
    icon: '#',
    description: 'DM your agent in any Slack workspace',
    setupSteps: [
      '1. Go to api.slack.com/apps → click "Create New App" → choose "From an app manifest"',
      '2. Select your workspace. When asked for the manifest format, choose JSON. Then paste the manifest below (click "Copy" to copy it):',
      'COPYABLE:{"display_information":{"name":"OpenJarvis"},"features":{"app_home":{"home_tab_enabled":true,"messages_tab_enabled":true,"messages_tab_read_only_enabled":false},"bot_user":{"display_name":"OpenJarvis","always_online":true}},"oauth_config":{"scopes":{"bot":["chat:write","im:write","im:read","im:history","mpim:read","mpim:history","users:read","channels:read","channels:history","channels:join","groups:read","groups:history","app_mentions:read"]}},"settings":{"event_subscriptions":{"bot_events":["message.im"]},"socket_mode_enabled":true}}',
      '3. Click "Next" → review the summary → click "Create". Then go to "Install App" in the left sidebar → click "Install to Workspace" → click "Allow"',
      '4. In the left sidebar, click "OAuth & Permissions". Copy the "Bot User OAuth Token" (starts with xoxb-...)',
      '5. In the left sidebar, click "Basic Information" → scroll to "App-Level Tokens" → click "Generate Token and Scopes" → name it "socket" → click "Add Scope" → select "connections:write" → click "Generate" → copy the token (starts with xapp-...)',
      '6. (Optional) Still in "Basic Information", scroll to "Display Information" → upload the OpenJarvis icon as the app icon',
      '7. Paste both tokens below and click Connect',
    ],
    fields: [
      { key: 'bot_token', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', required: true },
      { key: 'app_token', label: 'App Token', placeholder: 'xapp-...', type: 'password', required: true },
    ],
    activeLabel: () => 'Connected to Slack',
    howToUse: () => 'Open Slack and DM @OpenJarvis to talk to your agent.',
  },
];

// ---------------------------------------------------------------------------
// SendBlue webhook step — ngrok tunnel + registration
// ---------------------------------------------------------------------------

function SendBlueWebhookStep({
  apiKey, apiSecret, selectedNumber,
}: {
  apiKey: string; apiSecret: string; selectedNumber: string;
}) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');

  const registerWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setWebhookStatus('registering');
    try {
      const url = webhookUrl.trim().replace(/\/+$/, '') + '/v1/channels/sendblue/webhook';
      await sendblueRegisterWebhook(apiKey, apiSecret, url);
      setWebhookStatus('done');
    } catch {
      setWebhookStatus('error');
    }
  };

  return (
    <div className="px-4 pb-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--color-border)' }}>
      <StepLine steps={SENDBLUE_STEPS} current={2} label="SendBlue setup" />

      <div className="flex items-center gap-3 py-3" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <Station line="tools" state="current" />
        <div className="min-w-0">
          <div className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
            Your agent is now reachable via iMessage / SMS
          </div>
          <div className="tn-mono text-[20px] leading-7 font-semibold" style={{ color: 'var(--color-text)' }}>{selectedNumber}</div>
        </div>
      </div>

      {/* Webhook / ngrok step */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <LineBullet letter="4" size={20} />
          <span className="text-[14px] font-semibold">Set up webhook to receive texts</span>
        </div>
        <ol className="list-none text-[13px] leading-5 space-y-1.5 mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          <li><strong style={{ color: 'var(--color-text)' }}>1.</strong> Open a terminal and run: <code className="tn-mono px-1" style={{ color: 'var(--color-text)', background: 'var(--color-code-bg)' }}>ngrok http 8000</code></li>
          <li><strong style={{ color: 'var(--color-text)' }}>2.</strong> Copy the <code className="tn-mono px-1" style={{ color: 'var(--color-text)', background: 'var(--color-code-bg)' }}>https://</code> forwarding URL</li>
          <li><strong style={{ color: 'var(--color-text)' }}>3.</strong> Paste it below and click "Register Webhook"</li>
        </ol>
        <div className="flex gap-2">
          <input
            value={webhookUrl}
            onChange={(e) => { setWebhookUrl(e.target.value); setWebhookStatus('idle'); }}
            placeholder="https://abc123.ngrok-free.app"
            aria-label="Webhook URL"
            className="tn-input tn-mono flex-1 min-w-0"
          />
          <button
            onClick={registerWebhook}
            disabled={!webhookUrl.trim() || webhookStatus === 'registering'}
            className="tn-btn tn-btn-primary shrink-0"
          >
            {webhookStatus === 'registering' ? 'Registering...'
              : webhookStatus === 'done' ? 'Registered!'
              : webhookStatus === 'error' ? 'Retry'
              : 'Register Webhook'}
          </button>
        </div>
        {webhookStatus === 'done' && (
          <div className="flex items-center gap-2 text-[12px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            <Station line="tools" state="current" size={10} />
            Webhook registered! Incoming texts will be forwarded to your agent.
          </div>
        )}
        {webhookStatus === 'error' && (
          <div role="alert" className="text-[12px] mt-2" style={{ color: 'var(--fail)' }}>
            Failed to register. Check your ngrok URL and try again.
          </div>
        )}
        <div className="text-[12px] mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
          Don't have ngrok? <a href="https://ngrok.com/download" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: 'var(--action)' }}>Download it free</a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SendBlue setup wizard — guided multi-step flow
// ---------------------------------------------------------------------------

function SendBlueWizard({
  agentId,
  binding,
  onDone,
  onRemove,
}: {
  agentId: string;
  binding: ChannelBinding | undefined;
  onDone: () => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<'idle' | 'creds' | 'verifying' | 'verified' | 'connecting' | 'done' | 'test'>('idle');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [numbers, setNumbers] = useState<string[]>([]);
  const [selectedNumber, setSelectedNumber] = useState('');
  const [error, setError] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testSent, setTestSent] = useState(false);

  const [healthy, setHealthy] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const isActive = !!binding;
  const activeNumber = (binding?.config?.from_number as string) || '';

  // Check health on mount when active
  useEffect(() => {
    if (!isActive) return;
    sendblueHealth().then((h) => setHealthy(h.ready)).catch(() => setHealthy(false));
  }, [isActive]);

  const handleReconnect = async () => {
    if (!binding) return;
    setReconnecting(true);
    try {
      // Re-bind to re-create the bridge
      const cfg = binding.config || {};
      await unbindAgentChannel(agentId, binding.id);
      await bindAgentChannel(agentId, 'sendblue', cfg as Record<string, unknown>);
      setHealthy(true);
      onDone();
    } catch { /* */ } finally { setReconnecting(false); }
  };

  const handleVerify = async () => {
    setError('');
    setStep('verifying');
    try {
      const result = await sendblueVerify(apiKey, apiSecret);
      if (result.valid && result.numbers.length > 0) {
        setNumbers(result.numbers);
        setSelectedNumber(result.numbers[0]);
        setStep('verified');
      } else if (result.valid) {
        // Free tier / shared line — no dedicated number returned
        // Move to verified step so user can enter the number manually
        setNumbers([]);
        setSelectedNumber('');
        setStep('verified');
      } else {
        setError('Invalid credentials. Check your API key and secret.');
        setStep('creds');
      }
    } catch (e) {
      setError((e as Error).message);
      setStep('creds');
    }
  };

  const handleConnect = async () => {
    setError('');
    setStep('connecting');
    try {
      // 1. Bind the channel
      await bindAgentChannel(agentId, 'sendblue', {
        api_key_id: apiKey,
        api_secret_key: apiSecret,
        from_number: selectedNumber,
      });
      // 2. Try to auto-register webhook (best effort)
      try {
        const webhookUrl = `${window.location.origin}/webhooks/sendblue`;
        await sendblueRegisterWebhook(apiKey, apiSecret, webhookUrl);
      } catch {
        // Non-fatal — user may need to set up ngrok manually
      }
      setStep('done');
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setStep('verified');
    }
  };

  const handleTest = async () => {
    if (!testNumber.trim()) return;
    setError('');
    try {
      const cfg = binding?.config || {};
      await sendblueTest(
        (cfg.api_key_id as string) || apiKey,
        (cfg.api_secret_key as string) || apiSecret,
        activeNumber || selectedNumber,
        testNumber.trim(),
      );
      setTestSent(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Active state
  if (isActive && !expanded) {
    return (
      <div className="tn-panel mb-3" style={SURFACE_STATIONS}>
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
          <Station line="tools" state={healthy ? 'current' : 'failed'} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14px]">iMessage / SMS</div>
            <div className="tn-mono text-[12px]" style={{ color: healthy ? 'var(--color-text-secondary)' : 'var(--fail)' }}>
              {healthy ? `Active on ${activeNumber}` : `Disconnected — ${activeNumber}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!healthy && (
              <button
                onClick={handleReconnect}
                disabled={reconnecting}
                className="tn-btn tn-btn-sm tn-btn-primary"
              >
                {reconnecting ? '...' : 'Reconnect'}
              </button>
            )}
            <StatusText tone={healthy ? 'default' : 'fail'}>{healthy ? 'Active' : 'Disconnected'}</StatusText>
            <button onClick={() => setExpanded(true)} className="tn-btn tn-btn-sm">
              Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active + expanded (show how to use + test)
  if (isActive && expanded) {
    return (
      <div className="tn-panel mb-3" style={SURFACE_STATIONS}>
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
          <Station line="tools" state="current" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14px]">iMessage / SMS</div>
            <div className="tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Active on {activeNumber}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setExpanded(false)} className="tn-btn tn-btn-sm">Collapse</button>
            <button onClick={() => onRemove(binding!.id)} className="tn-btn tn-btn-sm tn-btn-danger">Remove</button>
          </div>
        </div>
        <div className="px-4 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[13px] mb-4 leading-5 max-w-[72ch]">
            Text <strong className="tn-mono">{activeNumber}</strong> from any phone to talk to your agent.
            Responses arrive as iMessage (blue bubbles) when possible, SMS otherwise.
          </p>

          <FieldLabel>Send a test message</FieldLabel>
          <div className="flex gap-2 max-w-md">
            <input
              value={testNumber}
              onChange={(e) => { setTestNumber(e.target.value); setTestSent(false); }}
              placeholder="Your phone number (+1...)"
              aria-label="Your phone number"
              className="tn-input tn-mono flex-1 min-w-0"
            />
            <button
              onClick={handleTest}
              disabled={!testNumber.trim() || testSent}
              className="tn-btn tn-btn-primary shrink-0"
            >
              {testSent ? 'Sent!' : 'Send Test'}
            </button>
          </div>
          {error && <div role="alert" className="text-[12px] mt-2" style={{ color: 'var(--fail)' }}>{error}</div>}
        </div>
      </div>
    );
  }

  const stepIndex = step === 'verified' || step === 'connecting' ? 1 : 0;

  // Not active — setup wizard
  return (
    <div className="tn-panel mb-3" style={SURFACE_STATIONS}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setStep(step === 'idle' ? 'creds' : 'idle')}
      >
        <Station line="tools" state={step === 'idle' ? 'open' : 'current'} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px]">iMessage / SMS</div>
          <div className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            Your agent gets its own phone number — text it via iMessage or SMS
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setStep(step === 'idle' ? 'creds' : 'idle'); }}
          className={`tn-btn tn-btn-sm shrink-0 ${step === 'idle' ? 'tn-btn-primary' : ''}`}
        >
          {step === 'idle' ? 'Set Up' : 'Cancel'}
        </button>
      </div>

      {step !== 'idle' && step !== 'done' && (
        <div className="px-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <StepLine steps={SENDBLUE_STEPS} current={stepIndex} label="SendBlue setup" />
        </div>
      )}

      {/* Step 1: Sign up + enter credentials */}
      {(step === 'creds' || step === 'verifying') && (
        <div className="px-4 pb-4 pt-5 max-w-lg">
          <div className="flex items-center gap-2 mb-3">
            <LineBullet letter="1" size={20} />
            <span className="text-[14px] font-semibold">Create a SendBlue account</span>
          </div>
          <button
            onClick={() => window.open('https://dashboard.sendblue.com/company-signup', '_blank')}
            className="tn-btn tn-btn-sm mb-5"
          >
            Open SendBlue signup <ArrowUpRight size={13} />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <LineBullet letter="2" size={20} />
            <span className="text-[14px] font-semibold">Paste your API credentials</span>
          </div>
          <p className="text-[13px] mb-3 leading-5" style={{ color: 'var(--color-text-secondary)' }}>
            Go to your{' '}
            <a href="https://dashboard.sendblue.co/api-credentials" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: 'var(--action)' }}>
              SendBlue API Credentials page
            </a>{' '}
            and copy the API Key and API Secret.
          </p>

          <label className="block mb-3">
            <FieldLabel>API Key ID *</FieldLabel>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your API key ID" className="tn-input tn-mono" />
          </label>
          <label className="block mb-4">
            <FieldLabel>API Secret Key *</FieldLabel>
            <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Your API secret key" type="password" className="tn-input tn-mono" />
          </label>

          {error && <div role="alert" className="text-[12px] mb-3" style={{ color: 'var(--fail)' }}>{error}</div>}

          <button
            onClick={handleVerify}
            disabled={!apiKey.trim() || !apiSecret.trim() || step === 'verifying'}
            className="tn-btn tn-btn-primary"
          >
            {step === 'verifying' ? 'Verifying...' : 'Verify & Find Number'}
          </button>
        </div>
      )}

      {/* Step 2: Number found — confirm + connect */}
      {(step === 'verified' || step === 'connecting') && (
        <div className="px-4 pb-4 pt-5 max-w-lg">
          <div className="flex items-center gap-2 mb-4 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
            <Station line="tools" state="current" size={12} />
            Credentials verified
          </div>

          <div className="flex items-center gap-2 mb-3">
            <LineBullet letter="3" size={20} />
            <span className="text-[14px] font-semibold">Your agent's phone number</span>
          </div>

          {numbers.length > 1 ? (
            <label className="block mb-4">
              <FieldLabel>Select a number for your agent</FieldLabel>
              <select
                value={selectedNumber}
                onChange={(e) => setSelectedNumber(e.target.value)}
                className="tn-select tn-mono"
              >
                {numbers.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ) : numbers.length === 1 ? (
            <div className="mb-4 py-2" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
              <div className="tn-mono text-[18px] leading-6 font-semibold">{selectedNumber}</div>
              <div className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>This will be your agent's phone number</div>
            </div>
          ) : (
            <div className="mb-4">
              <p className="text-[13px] mb-3 leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                Copy the phone number shown under <strong style={{ color: 'var(--color-text)' }}>"Send from"</strong> in your SendBlue dashboard
                and paste it below. On the free tier this is a shared number.
              </p>
              <label className="block">
                <FieldLabel>SendBlue phone number *</FieldLabel>
                <input
                  value={selectedNumber}
                  onChange={(e) => setSelectedNumber(e.target.value)}
                  placeholder="+16452468235"
                  className="tn-input tn-mono"
                />
              </label>
            </div>
          )}

          {error && <div role="alert" className="text-[12px] mb-3" style={{ color: 'var(--fail)' }}>{error}</div>}

          <button
            onClick={handleConnect}
            disabled={step === 'connecting' || !selectedNumber.trim()}
            className="tn-btn tn-btn-primary"
          >
            {step === 'connecting' ? 'Connecting...' : 'Activate Phone Number'}
          </button>
        </div>
      )}

      {/* Step 3: Done — success + webhook setup */}
      {step === 'done' && (
        <SendBlueWebhookStep
          apiKey={apiKey}
          apiSecret={apiSecret}
          selectedNumber={selectedNumber}
        />
      )}
    </div>
  );
}

function MessagingTab({ agentId }: { agentId: string }) {
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [setupType, setSetupType] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadBindings = useCallback(() => {
    fetchAgentChannels(agentId).then(setBindings).catch(() => setBindings([]));
  }, [agentId]);

  useEffect(() => { loadBindings(); }, [loadBindings]);

  const setField = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSetup = async (ch: MessagingChannelConfig) => {
    // Check required fields
    const missing = ch.fields.filter(
      (f) => f.required && !formValues[f.key]?.trim(),
    );
    if (missing.length > 0) return;

    setLoading(true);
    try {
      const config: Record<string, string> = {};
      for (const f of ch.fields) {
        const v = formValues[f.key]?.trim();
        if (v) config[f.key] = v;
      }
      await bindAgentChannel(agentId, ch.type, config);
      setSetupType(null);
      setFormValues({});
      loadBindings();
    } catch { /* */ } finally { setLoading(false); }
  };

  const handleRemove = async (bindingId: string) => {
    try {
      await unbindAgentChannel(agentId, bindingId);
      loadBindings();
    } catch { /* */ }
  };

  return (
    <div className="py-2 max-w-3xl">
      <p className="text-[14px] mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Connect a messaging channel so you can talk to your agent from your phone or other devices.
      </p>

      {/* SendBlue wizard — primary option */}
      <SendBlueWizard
        agentId={agentId}
        binding={bindings.find((b) => b.channel_type === 'sendblue')}
        onDone={loadBindings}
        onRemove={(id) => { unbindAgentChannel(agentId, id).then(loadBindings).catch(() => {}); }}
      />

      <SectionHeading as="h3" className="mt-8 mb-3">Other messaging channels</SectionHeading>

      {MESSAGING_CHANNELS.map((ch) => {
        const binding = bindings.find((b) => b.channel_type === ch.type);
        const cfg = (binding?.config || {}) as Record<string, unknown>;
        const isSetup = setupType === ch.type;

        // Check if required fields are filled
        const canConnect = ch.fields.every(
          (f) => !f.required || formValues[f.key]?.trim(),
        );

        return (
          <div key={ch.type} className="tn-panel mb-3" style={SURFACE_STATIONS}>
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <Station line="tools" state={binding ? 'current' : isSetup ? 'current' : 'open'} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px]">{ch.name}</div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {binding ? ch.activeLabel(cfg) : ch.description}
                </div>
              </div>
              {binding ? (
                <div className="flex items-center gap-2">
                  <StatusText>Active</StatusText>
                  <button onClick={() => handleRemove(binding.id)} className="tn-btn tn-btn-sm tn-btn-danger">Remove</button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setSetupType(isSetup ? null : ch.type);
                    setFormValues({});
                  }}
                  className={`tn-btn tn-btn-sm ${isSetup ? '' : 'tn-btn-primary'}`}
                >
                  {isSetup ? 'Cancel' : 'Set Up'}
                </button>
              )}
            </div>

            {/* Active state: how to use */}
            {binding && (
              <div className="px-4 py-3 text-[13px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {ch.howToUse(cfg)}
              </div>
            )}

            {/* Setup form */}
            {isSetup && (
              <div className="px-4 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                {/* Setup instructions */}
                <div className="text-[13px] leading-5 mb-4 max-w-[72ch] space-y-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {ch.setupSteps.map((step, i) => {
                    if (step.startsWith('COPYABLE:')) {
                      const text = step.slice(9);
                      return (
                        <div key={i} className="relative my-2" style={{ background: 'var(--color-code-bg)', border: '1px solid var(--color-border)', borderRadius: 2 }}>
                          <div className="flex justify-end px-2 pt-2">
                            <button
                              onClick={() => { navigator.clipboard.writeText(text); }}
                              className="tn-btn tn-btn-sm"
                            >Copy</button>
                          </div>
                          <div className="tn-mono text-[11px] leading-4 px-3 pb-3 pt-1 break-all overflow-y-auto" style={{ maxHeight: 96, color: 'var(--color-text)' }}>
                            {text}
                          </div>
                        </div>
                      );
                    }
                    return <div key={i}>{step}</div>;
                  })}
                </div>

                {/* Form fields */}
                <div className="max-w-md">
                  {ch.fields.map((field) => (
                    <label key={field.key} className="block mb-3">
                      <FieldLabel>{field.label}{field.required ? ' *' : ''}</FieldLabel>
                      <input
                        type={field.type || 'text'}
                        value={formValues[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="tn-input tn-mono"
                      />
                    </label>
                  ))}

                  {/* Connect button */}
                  <button
                    onClick={() => handleSetup(ch)}
                    disabled={loading || !canConnect}
                    className="tn-btn tn-btn-primary mt-1"
                  >
                    {loading ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Learning tab component
// ---------------------------------------------------------------------------

function LearningTab({ agentId, learningEnabled }: { agentId: string; learningEnabled: boolean }) {
  const [logs, setLogs] = useState<LearningLogEntry[]>([]);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchLearningLog(agentId).then(setLogs).catch(() => {});
  }, [agentId]);

  async function handleTrigger() {
    setTriggering(true);
    try {
      await triggerLearning(agentId);
      // Refresh after a short delay
      setTimeout(() => fetchLearningLog(agentId).then(setLogs).catch(() => {}), 1000);
    } catch {
      // ignore
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <SectionHeading
        actions={
          <>
            <StatusText>{learningEnabled ? 'Enabled' : 'Disabled'}</StatusText>
            <button onClick={handleTrigger} disabled={triggering} className="tn-btn tn-btn-sm">
              <RefreshCw size={13} />
              Run Learning
            </button>
          </>
        }
      >
        Learning
      </SectionHeading>
      {logs.length === 0 ? (
        <div className="text-[14px] text-center py-10" style={{ color: 'var(--color-text-tertiary)' }}>
          No learning events yet. Run the agent or trigger learning manually.
        </div>
      ) : (
        <ul className="list-none" aria-label="Learning events">
          {logs.map((entry, i) => (
            <RailItem key={entry.id} line="data" state="open" first={i === 0} last={i === logs.length - 1} stationTop={13}>
              <div className="py-2.5 text-[14px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="tn-mono text-[13px] font-medium">{entry.event_type}</span>
                  <span className="tn-mono text-[12px] shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </div>
                {entry.description && (
                  <p className="mt-0.5 max-w-[72ch]" style={{ color: 'var(--color-text-secondary)' }}>{entry.description}</p>
                )}
              </div>
            </RailItem>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logs tab component
// ---------------------------------------------------------------------------

function LogsTab({ agentId, line }: { agentId: string; line: Line }) {
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [learningEntries, setLearningEntries] = useState<LearningLogEntry[]>([]);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        fetchAgentTraces(agentId),
        fetchLearningLog(agentId),
      ]);
      setTraces(t);
      setLearningEntries(l);
    } catch {
      // ignore
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
    // Fallback slow poll — WS is primary, this catches missed events
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Event-driven refresh — trace/learning entries are created by tick + tool events
  useAgentEvents(agentId, loadData, [
    'agent_tick_end',
    'agent_tick_error',
    'tool_call_end',
    'inference_end',
    'agent_learning_completed',
  ]);

  // Merge traces and learning entries into a unified timeline
  type TimelineEntry =
    | { kind: 'trace'; data: AgentTrace; ts: number }
    | { kind: 'learning'; data: LearningLogEntry; ts: number };

  const timeline: TimelineEntry[] = [
    ...traces.map((t): TimelineEntry => ({ kind: 'trace', data: t, ts: t.started_at })),
    ...learningEntries.map((e): TimelineEntry => ({ kind: 'learning', data: e, ts: e.created_at })),
  ].sort((a, b) => b.ts - a.ts);

  const learningEventLabel = (eventType: string) => {
    if (eventType === 'query_start') return 'Query';
    if (eventType === 'query_complete') return 'Complete';
    if (eventType === 'tool_call') return 'Tool Call';
    if (eventType === 'tool_result') return 'Tool Result';
    if (eventType === 'query_error') return 'Error';
    return eventType;
  };

  /** Tool events ride the tools line, other learning events the data line. */
  const learningEventLine = (eventType: string): Line =>
    eventType === 'tool_call' || eventType === 'tool_result' ? 'tools' : 'data';

  return (
    <div className="space-y-4 max-w-3xl">
      <SectionHeading
        actions={
          <span className="tn-mono text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {timeline.length} entr{timeline.length !== 1 ? 'ies' : 'y'} (auto-refreshing)
          </span>
        }
      >
        Activity Log
      </SectionHeading>
      {timeline.length === 0 ? (
        <div className="text-[14px] text-center py-10" style={{ color: 'var(--color-text-tertiary)' }}>
          No activity yet. Send a message or run the agent to generate logs.
        </div>
      ) : (
        <ul className="list-none" aria-label="Activity log">
          {timeline.map((entry, idx) => {
            const first = idx === 0;
            const last = idx === timeline.length - 1;
            if (entry.kind === 'learning') {
              const e = entry.data;
              const failed = e.event_type === 'query_error';
              return (
                <RailItem
                  key={`learn-${e.id}`}
                  line={learningEventLine(e.event_type)}
                  state={failed ? 'failed' : 'open'}
                  first={first}
                  last={last}
                  stationTop={13}
                >
                  <div className="py-2.5 text-[14px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <StatusText tone={failed ? 'fail' : 'default'} className="text-[13px]! font-medium">
                        {learningEventLabel(e.event_type)}
                      </StatusText>
                      <span className="tn-mono text-[12px] shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                        {formatRelativeTime(e.created_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[13px] max-w-[72ch]" style={{ color: 'var(--color-text-secondary)' }}>
                      {e.description}
                    </div>
                  </div>
                </RailItem>
              );
            }

            // Trace entry
            const t = entry.data;
            const errorDetail = t.metadata?.error_detail as
              | { error_type: string; error_message: string; suggested_action: string }
              | undefined;
            const isError = t.outcome !== 'success';
            const isExpanded = expandedTrace === t.id;
            const canExpand = isError && !!errorDetail;

            return (
              <RailItem
                key={`trace-${t.id}`}
                line={line}
                state={isError ? 'failed' : 'current'}
                first={first}
                last={last}
                stationTop={13}
              >
                <div
                  className={`py-2.5 text-[14px] ${canExpand ? 'cursor-pointer' : ''}`}
                  onClick={() => canExpand && setExpandedTrace(isExpanded ? null : t.id)}
                  role={canExpand ? 'button' : undefined}
                  tabIndex={canExpand ? 0 : undefined}
                  aria-expanded={canExpand ? isExpanded : undefined}
                  onKeyDown={(ev) => {
                    if (canExpand && (ev.key === 'Enter' || ev.key === ' ')) {
                      ev.preventDefault();
                      setExpandedTrace(isExpanded ? null : t.id);
                    }
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-3 min-w-0 flex-wrap">
                      <span className="font-semibold" style={{ color: isError ? 'var(--fail)' : 'var(--color-text)' }}>{t.outcome}</span>
                      <span className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>Trace</span>
                      {errorDetail && (
                        <StatusText tone={errorDetail.error_type === 'fatal' ? 'fail' : 'default'}>
                          {errorDetail.error_type}
                        </StatusText>
                      )}
                    </span>
                    <span className="tn-mono text-[12px] shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatRelativeTime(t.started_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-0.5 tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>{t.duration.toFixed(1)}s</span>
                    <span>{t.steps} step{t.steps !== 1 ? 's' : ''}</span>
                  </div>
                  {isExpanded && errorDetail && (
                    <dl className="mt-2 pt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <dt className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Error: </dt>
                      <dd style={{ color: 'var(--color-text)' }}>{errorDetail.error_message}</dd>
                      <dt className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Action: </dt>
                      <dd style={{ color: 'var(--color-text)' }}>{errorDetail.suggested_action}</dd>
                    </dl>
                  )}
                </div>
              </RailItem>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function AgentsPage() {
  const managedAgents = useAppStore((s) => s.managedAgents);
  const setManagedAgents = useAppStore((s) => s.setManagedAgents);
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);
  const savings = useAppStore((s) => s.savings);
  const [loading, setLoading] = useState(true);
  const [agentManagerAvailable, setAgentManagerAvailable] = useState<boolean | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [channels, setChannels] = useState<ChannelBinding[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'interact' | 'channels' | 'messaging' | 'tasks' | 'memory' | 'learning' | 'logs'>('interact');

  const refresh = useCallback(async () => {
    try {
      const agents = await fetchManagedAgents();
      setManagedAgents(agents);
      setAgentManagerAvailable(true);
    } catch (err: any) {
      if (err.message?.includes('404')) {
        setAgentManagerAvailable(false);
      }
      setManagedAgents([]);
    } finally {
      setLoading(false);
    }
  }, [setManagedAgents]);

  useEffect(() => {
    refresh();
    fetchTemplates().then(setTemplates).catch(() => {});
  }, [refresh]);

  const selectedAgent = managedAgents.find((a) => a.id === selectedAgentId);

  useEffect(() => {
    if (selectedAgentId) {
      fetchAgentTasks(selectedAgentId).then(setTasks).catch(() => setTasks([]));
      fetchAgentChannels(selectedAgentId).then(setChannels).catch(() => setChannels([]));
    }
  }, [selectedAgentId]);

  const handlePause = async (id: string) => {
    await pauseManagedAgent(id).catch(() => {});
    await refresh();
  };

  const handleResume = async (id: string) => {
    await resumeManagedAgent(id).catch(() => {});
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteManagedAgent(id).catch(() => {});
    if (selectedAgentId === id) setSelectedAgentId(null);
    await refresh();
  };

  const handleRun = async (id: string) => {
    try {
      await runManagedAgent(id);
    } catch (err: any) {
      toast.error('Failed to start agent', {
        description: err.message || 'Unknown error',
      });
      await refresh();
      return;
    }
    await refresh();
    setTimeout(async () => {
      try {
        const agent = await fetchManagedAgent(id);
        if (agent.status === 'error') {
          toast.error(`Agent "${agent.name}" failed`, {
            description: agent.summary_memory?.replace(/^ERROR: /, '') || 'Unknown error',
          });
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(), level: 'error', category: 'model',
            message: `Agent "${agent.name}" failed: ${agent.summary_memory || 'Unknown error'}`,
          });
        }
      } catch {}
      await refresh();
    }, 3000);
  };

  const handleRecover = async (id: string) => {
    try {
      const result = await recoverManagedAgent(id);
      if (result.checkpoint) {
        toast.success('Agent recovered from checkpoint');
      } else {
        toast.success('Agent reset to idle (no checkpoint available)');
      }
      setDetailTab('overview');
    } catch (err: any) {
      toast.error('Recovery failed', {
        description: err.message || 'Unknown error',
      });
    }
    await refresh();
  };

  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const agents = await fetchManagedAgents();
        for (const agent of agents) {
          const prev = prevStatuses.current[agent.id];
          if (prev && prev !== 'error' && agent.status === 'error') {
            toast.error(`Agent "${agent.name}" failed`, {
              description: agent.summary_memory?.replace(/^ERROR: /, '') || 'Unknown error',
            });
          }
          prevStatuses.current[agent.id] = agent.status;
        }
        // Keep the agent list — and the derived selectedAgent status badge —
        // live. This poll previously fetched statuses only to fire error
        // toasts and threw the result away, so a detail header could stay
        // stuck on "running" after a tick finished on the backend.
        setManagedAgents(agents);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [setManagedAgents]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <PageHeader title="Agents" />
          <p className="text-[14px] py-10" style={{ color: 'var(--color-text-tertiary)' }}>
            Loading agents...
          </p>
        </div>
      </div>
    );
  }

  // ── Detail View ─────────────────────────────────────────────────────────

  if (selectedAgent) {
    const successRate =
      tasks.length > 0
        ? Math.round((tasks.filter((t) => t.status === 'completed').length / tasks.length) * 100)
        : null;
    void successRate;

    const line = agentLine(selectedAgent);
    const model = (selectedAgent.config?.model as string) || '';

    const DETAIL_TABS = [
      { id: 'interact', label: 'Interact' },
      { id: 'overview', label: 'Overview' },
      { id: 'channels', label: 'Data Sources' },
      { id: 'messaging', label: 'Messaging Channels' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'memory', label: 'Memory' },
      { id: 'learning', label: 'Learning' },
      { id: 'logs', label: 'Logs' },
    ] as const;

    return (
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-5xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => setSelectedAgentId(null)}
          className="tn-btn tn-btn-sm tn-btn-ghost -ml-2.5 mb-4"
        >
          <ChevronLeft size={16} /> Back to agents
        </button>

        {/* Header */}
        <PageHeader
          title={
            <span className="flex items-center gap-3 min-w-0">
              <LineBullet letter={bulletLetter(selectedAgent.name)} line={line} size={28} />
              <span className="truncate">{selectedAgent.name}</span>
            </span>
          }
          meta={
            <span className="inline-flex items-center gap-x-4 gap-y-1 flex-wrap">
              <StatusBadge status={selectedAgent.status} line={line} />
              <span>{selectedAgent.agent_type}</span>
              {model && <span style={{ color: 'var(--color-text-tertiary)' }}>{model}</span>}
            </span>
          }
          actions={
            <>
              {detailTab === 'interact' ? (
                <span className="flex items-center gap-1.5 text-[13px] px-1" style={{ color: 'var(--color-text-secondary)' }}>
                  <MessageSquare size={14} /> Chat ready — just type below
                </span>
              ) : (
                <button onClick={() => handleRun(selectedAgent.id)} className="tn-btn tn-btn-primary">
                  <Zap size={14} /> Run Now
                </button>
              )}
              {(selectedAgent.status === 'running' || selectedAgent.status === 'idle') && (
                <button onClick={() => handlePause(selectedAgent.id)} className="tn-btn">
                  <Pause size={14} /> Pause
                </button>
              )}
              {selectedAgent.status === 'paused' && (
                <button onClick={() => handleResume(selectedAgent.id)} className="tn-btn">
                  <Play size={14} /> Resume
                </button>
              )}
              {(selectedAgent.status === 'error' || selectedAgent.status === 'stalled' || selectedAgent.status === 'needs_attention') && (
                <button onClick={() => handleRecover(selectedAgent.id)} className="tn-btn">
                  <AlertTriangle size={14} style={{ color: 'var(--fail)' }} /> Recover
                </button>
              )}
              <button
                onClick={async () => {
                  if (window.confirm(`Delete ${selectedAgent.name}? This cannot be undone.`)) {
                    await deleteManagedAgent(selectedAgent.id);
                    setSelectedAgentId(null);
                    await refresh();
                  }
                }}
                className="tn-btn tn-btn-danger"
                style={{ width: 36, padding: 0 }}
                title="Delete agent"
                aria-label="Delete agent"
              >
                <Trash2 size={15} />
              </button>
            </>
          }
        />

        {/* Tabs */}
        <div role="tablist" aria-label="Agent sections" className="tn-tabs mt-2 mb-6 overflow-x-auto">
          {DETAIL_TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={detailTab === id}
              onClick={() => setDetailTab(id)}
              className="tn-tab whitespace-nowrap shrink-0"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {detailTab === 'overview' && (
          <div className="space-y-10">
            {/* Instruction */}
            <AgentInstructionSection agent={selectedAgent} onAgentUpdated={refresh} />

            {/* Configuration */}
            <section>
              <SectionHeading>Configuration</SectionHeading>
              <AgentConfigGrid agent={selectedAgent} onAgentUpdated={refresh} />
              <p className="tn-mono text-[12px] mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                ID: {selectedAgent.id}
              </p>
            </section>

            {/* Hint for deep research agents */}
            {selectedAgent.agent_type === 'deep_research' && (
              <div className="tn-panel flex items-start gap-3 p-4 text-[14px] leading-5">
                <Database size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-text-secondary)' }} />
                <div style={{ color: 'var(--color-text-secondary)' }}>
                  <strong style={{ color: 'var(--color-text)' }}>Tip:</strong> Connect your personal data in the{' '}
                  <button
                    onClick={() => setDetailTab('channels')}
                    className="cursor-pointer underline underline-offset-2"
                    style={{ color: 'var(--action)', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                  >Data Sources</button>{' '}
                  tab, then set up{' '}
                  <button
                    onClick={() => setDetailTab('messaging')}
                    className="cursor-pointer underline underline-offset-2"
                    style={{ color: 'var(--action)', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                  >Messaging Channels</button>{' '}
                  to talk to this agent from your phone.
                </div>
              </div>
            )}

            {/* Usage stats + savings */}
            {(() => {
              const inTok = selectedAgent.input_tokens ?? 0;
              const outTok = selectedAgent.output_tokens ?? 0;
              const modelName = (selectedAgent.config?.model as string) || '';
              const paramMatch = modelName.match(/:(\d+(?:\.\d+)?)b/i);
              const paramsB = paramMatch ? parseFloat(paramMatch[1]) : 9;
              const flops = 2 * paramsB * 1e9 * (inTok + outTok);
              const providers = [
                { label: 'GPT-5.6 Sol', inPer1M: 5.0, outPer1M: 30.0 },
                { label: 'Claude Fable 5', inPer1M: 10.0, outPer1M: 50.0 },
                { label: 'Gemini 3.1 Pro', inPer1M: 2.0, outPer1M: 12.0 },
              ];
              const energyWh = (inTok + outTok) / 1000 * 0.4;
              const energyKj = energyWh * 3.6;
              const fmtFlops = flops >= 1e15 ? `${(flops / 1e15).toFixed(1)} PFLOPs` : `${(flops / 1e12).toFixed(1)} TFLOPs`;
              const hasSavings = inTok + outTok > 0;
              return (
                <div className="grid grid-cols-1 md:grid-cols-[auto_auto_minmax(0,1fr)] gap-x-10 gap-y-8">
                  <section>
                    <SectionHeading as="h4">Agent Statistics</SectionHeading>
                    <dl className="flex gap-6 flex-wrap mt-3">
                      <Figure label="Total Queries" value={selectedAgent.total_runs ?? 0} />
                      <Figure label="Input Tokens" value={inTok.toLocaleString()} />
                      <Figure label="Output Tokens" value={outTok.toLocaleString()} />
                    </dl>
                  </section>
                  {hasSavings && (<>
                    <section>
                      <SectionHeading as="h4">Local Utilization</SectionHeading>
                      <dl className="flex gap-6 flex-wrap mt-3">
                        <Figure label="Compute" value={fmtFlops} />
                        <Figure label="Energy" value={`${energyKj.toFixed(2)} kJ`} />
                      </dl>
                    </section>
                    <section>
                      <SectionHeading as="h4">Dollars Saved vs.</SectionHeading>
                      <dl className="flex gap-6 flex-wrap mt-3">
                        {providers.map((p) => {
                          const cost = (inTok / 1e6) * p.inPer1M + (outTok / 1e6) * p.outPer1M;
                          return <Figure key={p.label} label={p.label} value={`$${cost.toFixed(4)}`} />;
                        })}
                      </dl>
                    </section>
                  </>)}
                </div>);
            })()}

            {/* Channels summary */}
            {channels.length > 0 && (
              <section>
                <SectionHeading>Messaging Channels</SectionHeading>
                <ul className="list-none mt-2">
                  {channels.map((b) => (
                    <li key={b.id} className="flex items-center gap-2.5 py-2 tn-mono text-[13px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <Station line="tools" state="current" size={12} />
                      {b.channel_type}: {b.routing_mode}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* Tab: Interact */}
        {detailTab === 'interact' && <InteractTab agentId={selectedAgent.id} agentStatus={selectedAgent.status} onRunStateChange={refresh} />}

        {/* Tab: Channels */}
        {detailTab === 'channels' && (
          <ChannelsTab agentId={selectedAgent.id} />
        )}

        {/* Tab: Messaging */}
        {detailTab === 'messaging' && (
          <MessagingTab agentId={selectedAgent.id} />
        )}

        {/* Tab: Tasks */}
        {detailTab === 'tasks' && (
          <div className="max-w-3xl">
            {tasks.length > 0 && (
              <ul className="list-none" aria-label="Tasks">
                {tasks.map((t, i) => {
                  const state = statusStation(t.status);
                  return (
                    <RailItem key={t.id} line={line} state={state} first={i === 0} last={i === tasks.length - 1} stationTop={13}>
                      <div className="flex justify-between items-baseline gap-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span className="text-[14px] min-w-0" style={{ color: 'var(--color-text)' }}>
                          {t.description}
                        </span>
                        <StatusText tone={state === 'failed' ? 'fail' : 'default'} className="shrink-0">
                          {t.status}
                        </StatusText>
                      </div>
                    </RailItem>
                  );
                })}
              </ul>
            )}
            {tasks.length === 0 && (
              <div className="text-[14px] py-10 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                No tasks assigned.
              </div>
            )}
          </div>
        )}

        {/* Tab: Memory */}
        {detailTab === 'memory' && (
          <section className="max-w-3xl">
            <SectionHeading>Summary Memory</SectionHeading>
            <p className="whitespace-pre-wrap text-[15px] leading-[22px] mt-3 max-w-[72ch]" style={{ color: selectedAgent.summary_memory ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
              {selectedAgent.summary_memory || 'Agent has no stored memory yet.'}
            </p>
          </section>
        )}

        {/* Tab: Learning */}
        {detailTab === 'learning' && (
          <LearningTab agentId={selectedAgent.id} learningEnabled={!!selectedAgent.learning_enabled} />
        )}

        {/* Tab: Logs */}
        {detailTab === 'logs' && (
          <LogsTab agentId={selectedAgent.id} line={line} />
        )}
        </div>
      </div>
    );
  }

  // ── List View ───────────────────────────────────────────────────────────

  const runningCount = managedAgents.filter((a) => a.status === 'running').length;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
      {/* Launch wizard modal */}
      {showWizard && (
        <LaunchWizard
          templates={templates}
          onClose={() => setShowWizard(false)}
          onLaunched={() => {
            setShowWizard(false);
            refresh();
          }}
        />
      )}

      <PageHeader
        title="Agents"
        meta={
          managedAgents.length > 0
            ? `${managedAgents.length} agent${managedAgents.length !== 1 ? 's' : ''}${runningCount > 0 ? ` · ${runningCount} running` : ''}`
            : undefined
        }
        actions={
          <button
            onClick={() => agentManagerAvailable && setShowWizard(true)}
            disabled={agentManagerAvailable === false}
            className="tn-btn tn-btn-primary"
          >
            <Plus size={15} /> New Agent
          </button>
        }
      />
      <p className="text-[14px] mt-3 max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
        Long-running autonomous agents that can monitor sources, run tasks on a schedule, and message you through connected channels.
      </p>

      {agentManagerAvailable === false && (
        <div className="tn-panel tn-rule-fail mt-6 px-4 py-3 flex items-center gap-3 text-[14px]">
          <AlertTriangle size={16} className="shrink-0" style={{ color: 'var(--fail)' }} />
          <span>Agent manager is not enabled. Set <code className="tn-mono text-[13px]">agent_manager.enabled = true</code> in your config.</span>
        </div>
      )}

      {/* Agent lines */}
      {managedAgents.length > 0 && (
        <ul className="list-none mt-8" aria-label="Agents" style={{ borderTop: '2px solid var(--color-text)' }}>
          {managedAgents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              onClick={() => {
                setSelectedAgentId(a.id);
                setDetailTab('overview');
              }}
              onPause={handlePause}
              onResume={handleResume}
              onRun={handleRun}
              onRecover={handleRecover}
              onDelete={handleDelete}
              onChat={(id) => {
                setSelectedAgentId(id);
                setDetailTab('interact');
              }}
              onEdit={(id) => {
                setSelectedAgentId(id);
                setDetailTab('overview');
              }}
            />
          ))}
        </ul>
      )}

      {managedAgents.length === 0 && (
        <div className="py-16 max-w-md">
          <div aria-hidden="true" className="flex items-center w-40 mb-6">
            <Station line="none" state="unavailable" className="relative z-[1]" />
            <span className="flex-1 h-[5px] -mx-0.5" style={{ background: 'var(--color-border)' }} />
            <Station line="none" state="unavailable" className="relative z-[1]" />
          </div>
          <p className="mb-2 text-[17px] font-semibold" style={{ color: 'var(--color-text)' }}>
            No agents yet
          </p>
          <p className="text-[14px] mb-6" style={{ color: 'var(--color-text-secondary)' }}>Create your first agent to get started with autonomous task management.</p>
          <button
            onClick={() => agentManagerAvailable && setShowWizard(true)}
            disabled={agentManagerAvailable === false}
            className="tn-btn tn-btn-primary"
          >
            <Plus size={15} /> Launch your first agent
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
