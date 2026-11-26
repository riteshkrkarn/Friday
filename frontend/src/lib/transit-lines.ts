import type {
  ChatMessage,
  MessageTelemetry,
  StreamState,
  TokenUsage,
  ToolCallInfo,
} from '../types';
import { CLOUD_PREFIXES } from './chat-telemetry';
import { CLOUD_PROVIDERS } from './model-catalogue';

/** Engine family. Each family owns one route colour (`--line-<family>`). */
export type Line = 'local' | 'cloud' | 'tools' | 'data' | 'none';

export type StationState = 'open' | 'current' | 'unavailable' | 'failed';

export type RouteStopKind = 'device' | 'engine' | 'tool' | 'model' | 'search' | 'terminal';

export interface FigureRow {
  label: string;
  value: string;
}

export interface RouteStop {
  id: string;
  kind: RouteStopKind;
  line: Line;
  label: string;
  /** Short secondary text, e.g. tool status and latency. */
  detail?: string;
  state?: StationState;
  /** Figures shown when the station is hovered or focused. */
  rows?: FigureRow[];
}

export const LINE_NAMES: Record<Line, string> = {
  local: 'Local',
  cloud: 'Cloud',
  tools: 'Tools',
  data: 'Data',
  none: '',
};

/** CSS custom property holding a line's colour. */
export function lineColor(line: Line): string {
  return `var(--line-${line})`;
}

const CLOUD_ENGINES = new Set([
  'cloud',
  'litellm',
  'nim',
  'openai',
  'anthropic',
  'gemini',
  'google',
  'groq',
  'openrouter',
  'atlascloud',
]);

const CLOUD_OWNERS = new Set(['litellm', 'nim']);
const CLOUD_ID_PREFIXES = ['groq/', 'atlascloud/', 'openrouter/'];
const CLOUD_MODEL_IDS = new Set(
  CLOUD_PROVIDERS.flatMap((provider) => provider.models.map((model) => model.id)),
);

export function lineForEngine(engine?: string | null): Line {
  const name = engine?.trim().toLowerCase() ?? '';
  if (!name || name === 'multi') return 'none';
  return CLOUD_ENGINES.has(name) ? 'cloud' : 'local';
}

export function lineForModel(id?: string | null, ownedBy?: string | null): Line {
  const modelId = id?.trim() ?? '';
  if (ownedBy && CLOUD_OWNERS.has(ownedBy.trim().toLowerCase())) return 'cloud';
  if (!modelId) return 'none';
  if (CLOUD_MODEL_IDS.has(modelId)) return 'cloud';
  if (CLOUD_PREFIXES.some((prefix) => modelId.startsWith(prefix))) return 'cloud';
  if (CLOUD_ID_PREFIXES.some((prefix) => modelId.startsWith(prefix))) return 'cloud';
  return 'local';
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** The figures a reply carries: Engine, Tokens, Complexity, Token budget, Speed, Latency. */
export function figureRows(
  usage?: TokenUsage,
  telemetry?: MessageTelemetry,
  isResearch = false,
): FigureRow[] {
  const rows: FigureRow[] = [];
  if (isResearch) {
    rows.push({ label: 'Mode', value: 'Deep Research' });
  } else if (telemetry?.engine) {
    const modelDetail = telemetry.model_id || '';
    rows.push({ label: 'Engine', value: `${telemetry.engine}${modelDetail ? ` (${modelDetail})` : ''}` });
  }
  if (usage) {
    const tokenParts = [`${usage.completion_tokens} generated`, `${usage.prompt_tokens} prompt`];
    // Estimate thinking tokens: if total generated >> visible output, the
    // difference is internal reasoning (e.g. Qwen3.5 thinking mode).
    if (telemetry?.tokens_per_sec && telemetry.total_ms && usage.completion_tokens > 50) {
      const visibleEstimate = Math.ceil((telemetry.total_ms / 1000) * telemetry.tokens_per_sec);
      if (usage.completion_tokens > visibleEstimate * 1.5) {
        const thinking = usage.completion_tokens - visibleEstimate;
        tokenParts.push(`~${thinking} thinking`);
      }
    }
    rows.push({ label: 'Tokens', value: tokenParts.join(' \u00B7 ') });
  }
  if (telemetry?.complexity_tier) {
    rows.push({
      label: 'Complexity',
      value: `${telemetry.complexity_tier} (${telemetry.complexity_score?.toFixed(2)})`,
    });
  }
  if (telemetry?.suggested_max_tokens) {
    rows.push({ label: 'Token budget', value: `${telemetry.suggested_max_tokens}` });
  }
  if (telemetry?.tokens_per_sec) {
    rows.push({ label: 'Speed', value: `${Math.round(telemetry.tokens_per_sec)} tok/s` });
  }
  if (telemetry?.ttft_ms != null || telemetry?.total_ms != null) {
    const latencyParts: string[] = [];
    if (telemetry.ttft_ms != null) latencyParts.push(`TTFT ${formatMs(telemetry.ttft_ms)}`);
    if (telemetry.total_ms != null) latencyParts.push(`Total ${formatMs(telemetry.total_ms)}`);
    rows.push({ label: 'Latency', value: latencyParts.join(' \u00B7 ') });
  }
  return rows;
}

function toolStop(call: ToolCallInfo): RouteStop {
  const detailParts: string[] = [call.status];
  if (call.latency != null) detailParts.push(formatMs(call.latency));
  const rows: FigureRow[] = [
    { label: 'Tool', value: call.tool },
    { label: 'Status', value: call.status },
  ];
  if (call.latency != null) rows.push({ label: 'Latency', value: formatMs(call.latency) });
  return {
    id: `tool-${call.id}`,
    kind: 'tool',
    line: 'tools',
    label: call.tool,
    detail: detailParts.join(' \u00B7 '),
    state: call.status === 'error' ? 'failed' : call.status === 'running' ? 'current' : 'open',
    rows,
  };
}

const DEVICE_LABEL = 'This device';

/** Stations for a finished reply, built only from data the message carries. */
export function routeStopsForMessage(
  msg: Pick<ChatMessage, 'telemetry' | 'toolCalls' | 'researchTraces' | 'isResearch' | 'usage'>,
): RouteStop[] {
  const telemetry = msg.telemetry;
  const toolCalls = msg.toolCalls ?? [];
  const traces = msg.researchTraces ?? [];
  const hasTelemetry = !!telemetry && Object.values(telemetry).some((v) => v != null && v !== '');
  if (!hasTelemetry && toolCalls.length === 0 && traces.length === 0) return [];

  const device: RouteStop = { id: 'device', kind: 'device', line: 'local', label: DEVICE_LABEL };
  const stops: RouteStop[] = [device];

  if (msg.isResearch) {
    for (const trace of traces) {
      const rows: FigureRow[] = [{ label: 'Query', value: trace.query }];
      if (trace.numHits != null) rows.push({ label: 'Hits', value: `${trace.numHits}` });
      stops.push({
        id: `search-${trace.id}`,
        kind: 'search',
        line: 'data',
        label: trace.query,
        detail: trace.numHits != null ? `${trace.numHits} hits` : undefined,
        state: trace.status === 'pending' ? 'current' : 'open',
        rows,
      });
    }
    stops.push({
      id: 'terminal',
      kind: 'terminal',
      line: 'data',
      label: 'Deep Research',
      rows: figureRows(msg.usage, telemetry, true),
    });
    return stops;
  }

  const engineLine = lineForEngine(telemetry?.engine);
  if (telemetry?.engine) {
    stops.push({
      id: 'engine',
      kind: 'engine',
      line: engineLine,
      label: telemetry.engine,
      rows: [{ label: 'Engine', value: telemetry.engine }],
    });
  }
  for (const call of toolCalls) stops.push(toolStop(call));
  if (telemetry?.model_id) {
    stops.push({
      id: 'model',
      kind: 'model',
      line: engineLine !== 'none' ? engineLine : lineForModel(telemetry.model_id),
      label:
        telemetry.total_ms != null
          ? `${telemetry.model_id} \u00B7 ${formatMs(telemetry.total_ms)}`
          : telemetry.model_id,
      rows: figureRows(msg.usage, telemetry, false),
    });
  }
  return stops;
}

/** Stations for the reply that is streaming now: device, live tool calls, selected model. */
export function routeStopsForStream(
  streamState: Pick<StreamState, 'isStreaming' | 'activeToolCalls'>,
  selectedModel: string,
  ownedBy?: string,
): RouteStop[] {
  if (!streamState.isStreaming) return [];
  const stops: RouteStop[] = [
    { id: 'device', kind: 'device', line: 'local', label: DEVICE_LABEL },
  ];
  for (const call of streamState.activeToolCalls) stops.push(toolStop(call));
  if (selectedModel) {
    stops.push({
      id: 'model',
      kind: 'model',
      line: lineForModel(selectedModel, ownedBy),
      label: selectedModel,
      state: 'current',
    });
  }
  return stops;
}
