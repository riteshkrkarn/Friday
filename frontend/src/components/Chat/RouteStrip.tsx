import { useAppStore } from '../../lib/store';
import { routeStopsForMessage, routeStopsForStream } from '../../lib/transit-lines';
import { RouteStrip as TransitRouteStrip } from '../transit';
import type { ChatMessage, ToolCallInfo } from '../../types';

interface Props {
  message: ChatMessage;
  /** This reply is streaming now: stations come from the live stream. */
  isLive?: boolean;
}

const NO_CALLS: ToolCallInfo[] = [];

/**
 * The route a reply took: this device, the engine, each tool call and the
 * model. Stations come only from the telemetry and tool calls the message
 * carries; hovering or focusing one shows its figures.
 */
export function RouteStrip({ message, isLive = false }: Props) {
  const liveCalls = useAppStore((s) => (isLive ? s.streamState.activeToolCalls : NO_CALLS));
  const selectedModel = useAppStore((s) => (isLive ? s.selectedModel : ''));
  const ownedBy = useAppStore((s) =>
    isLive ? s.models.find((m) => m.id === s.selectedModel)?.owned_by : undefined,
  );

  const streaming = isLive && !message.isResearch;
  const stops = streaming
    ? routeStopsForStream({ isStreaming: true, activeToolCalls: liveCalls }, selectedModel, ownedBy)
    : routeStopsForMessage(message);

  if (stops.length === 0) {
    // No route data at all: keep the token count the reply reported.
    const usage = message.usage;
    if (isLive || !usage) return null;
    const text =
      usage.prompt_tokens || usage.completion_tokens
        ? `${usage.prompt_tokens} input tokens \u00B7 ${usage.completion_tokens} output tokens`
        : usage.total_tokens
          ? `${usage.total_tokens} tokens`
          : '';
    if (!text) return null;
    return (
      <p className="tn-mono text-[12px] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
        {text}
      </p>
    );
  }

  return (
    <TransitRouteStrip
      stops={stops}
      live={isLive}
      label={isLive ? 'Route so far' : 'Route of this reply'}
      className="mb-4"
    />
  );
}
