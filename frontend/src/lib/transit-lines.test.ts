import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../types';
import {
  formatMs,
  lineForEngine,
  lineForModel,
  routeStopsForMessage,
  routeStopsForStream,
} from './transit-lines';

function message(partial: Partial<ChatMessage>): ChatMessage {
  return { id: 'm1', role: 'assistant', content: 'ok', timestamp: 0, ...partial };
}

describe('line classification', () => {
  it('treats litellm and nim owners as cloud', () => {
    expect(lineForModel('some-model', 'litellm')).toBe('cloud');
    expect(lineForModel('meta/llama', 'nim')).toBe('cloud');
  });

  it('treats a Groq model id as cloud', () => {
    expect(lineForModel('groq/openai/gpt-oss-20b')).toBe('cloud');
  });

  it('treats an Ollama model owned by openjarvis as local', () => {
    expect(lineForModel('qwen3.5:2b', 'openjarvis')).toBe('local');
  });

  it('returns none for an empty or multi engine and an empty model id', () => {
    expect(lineForEngine('')).toBe('none');
    expect(lineForEngine('multi')).toBe('none');
    expect(lineForModel('')).toBe('none');
  });

  it('maps cloud engine names to cloud and the rest to local', () => {
    expect(lineForEngine('groq')).toBe('cloud');
    expect(lineForEngine('nim')).toBe('cloud');
    expect(lineForEngine('ollama')).toBe('local');
  });

  it('formats milliseconds like the reply figures', () => {
    expect(formatMs(640)).toBe('640ms');
    expect(formatMs(1900)).toBe('1.9s');
  });
});

describe('route stops', () => {
  it('orders device, engine, each tool call, then model', () => {
    const stops = routeStopsForMessage(
      message({
        telemetry: { engine: 'ollama', model_id: 'qwen3.5:2b', total_ms: 1900 },
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        toolCalls: [
          { id: 't1', tool: 'read_config', arguments: '{}', status: 'success', latency: 40 },
          { id: 't2', tool: 'web_search', arguments: '{}', status: 'error' },
        ],
      }),
    );
    expect(stops.map((s) => s.kind)).toEqual(['device', 'engine', 'tool', 'tool', 'model']);
    expect(stops.map((s) => s.line)).toEqual(['local', 'local', 'tools', 'tools', 'local']);
    expect(stops[3].state).toBe('failed');
    expect(stops[4].label).toBe('qwen3.5:2b \u00B7 1.9s');
    expect(stops[4].rows?.map((r) => r.label)).toEqual(['Engine', 'Tokens', 'Latency']);
  });

  it('draws a research reply on the data line with a Deep Research terminal', () => {
    const stops = routeStopsForMessage(
      message({
        isResearch: true,
        telemetry: { engine: 'ollama', model_id: 'qwen3.5:2b' },
        researchTraces: [
          { id: 'r1', query: 'groq pricing', status: 'complete', numHits: 4 },
          { id: 'r2', query: 'groq limits', status: 'complete', numHits: 2 },
        ],
      }),
    );
    expect(stops.map((s) => s.kind)).toEqual(['device', 'search', 'search', 'terminal']);
    expect(stops.slice(1).every((s) => s.line === 'data')).toBe(true);
    expect(stops[3].label).toBe('Deep Research');
    expect(stops.some((s) => s.kind === 'engine' || s.kind === 'model')).toBe(false);
  });

  it('returns no stops for a message without telemetry, tool calls or traces', () => {
    expect(routeStopsForMessage(message({}))).toEqual([]);
  });

  it('builds the live strip from active tool calls and the selected model', () => {
    const stops = routeStopsForStream(
      {
        isStreaming: true,
        activeToolCalls: [{ id: 't1', tool: 'read_config', arguments: '{}', status: 'running' }],
      },
      'groq/openai/gpt-oss-20b',
    );
    expect(stops.map((s) => s.kind)).toEqual(['device', 'tool', 'model']);
    expect(stops[2].line).toBe('cloud');
    expect(stops[2].state).toBe('current');
    expect(routeStopsForStream({ isStreaming: false, activeToolCalls: [] }, 'x')).toEqual([]);
  });
});
