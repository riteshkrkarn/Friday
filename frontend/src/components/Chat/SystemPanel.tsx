import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getBase, authHeaders } from '../../lib/api';
import {
  LINE_NAMES,
  formatMs,
  lineColor,
  lineForEngine,
  lineForModel,
  type Line,
} from '../../lib/transit-lines';
import { LineMap, SectionHeading, type LineMapItem } from '../transit';
import type { ChatMessage, ModelInfo, ServerInfo } from '../../types';
interface EnergyData {
  total_energy_j?: number;
  energy_per_token_j?: number;
  avg_power_w?: number;
  cpu_temp_c?: number | null;
  gpu_temp_c?: number | null;
}

interface TelemetryStats {
  total_requests?: number;
  total_tokens?: number;
}

const CLOUD_PRICING = [
  { name: 'GPT-5.6 Sol', input: 5.00, output: 30.00, primary: true },
  { name: 'Claude Fable 5', input: 10.00, output: 50.00, primary: false },
  { name: 'Gemini 3.1 Pro', input: 2.00, output: 12.00, primary: false },
];

export function SystemPanel({ className = '' }: { className?: string }) {
  const savings = useAppStore((s) => s.savings);
  const toggleSystemPanel = useAppStore((s) => s.toggleSystemPanel);
  const optInEnabled = useAppStore((s) => s.optInEnabled);
  const setOptInModalOpen = useAppStore((s) => s.setOptInModalOpen);
  const liveEnergy = useAppStore((s) => s.liveEnergy);
  const messages = useAppStore((s) => s.messages);
  const models = useAppStore((s) => s.models);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const apiReachable = useAppStore((s) => s.apiReachable);
  const [energy, setEnergy] = useState<EnergyData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const base = getBase();
      const [energyRes, telRes] = await Promise.allSettled([
        fetch(`${base}/v1/telemetry/energy`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${base}/v1/telemetry/stats`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (energyRes.status === 'fulfilled' && energyRes.value) {
        setEnergy(energyRes.value as EnergyData);
      }
      if (telRes.status === 'fulfilled' && telRes.value) {
        setTelemetry(telRes.value as TelemetryStats);
      }
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Re-fetch energy/telemetry when savings updates (after a chat message)
  useEffect(() => {
    if (savings) fetchData();
  }, [savings, fetchData]);

  const promptK = (savings?.total_prompt_tokens ?? 0) / 1000;
  const completionK = (savings?.total_completion_tokens ?? 0) / 1000;
  const localCost = savings?.local_cost ?? 0;

  const network = useMemo(
    () => buildNetwork(messages, models, serverInfo, apiReachable),
    [messages, models, serverInfo, apiReachable],
  );

  return (
    <aside
      aria-label="System"
      className={`flex flex-col h-full overflow-y-auto ${className}`}
      style={{
        width: 320,
        minWidth: 320,
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--color-border)',
        '--station-fill': 'var(--color-bg)',
      } as CSSProperties}
    >
      <div className="flex items-center justify-between h-12 pl-6 pr-3 shrink-0">
        <span className="text-[13px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
          System
        </span>
        <button
          type="button"
          onClick={toggleSystemPanel}
          className="tn-icon-btn"
          title="Close panel"
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-8 px-6 pb-8">
        {/* Network */}
        <section aria-labelledby="sys-network">
          <SectionHeading id="sys-network">Network</SectionHeading>
          {network.engineCount === 0 && (
            <p className="text-[13px] mt-3" style={{ color: 'var(--color-text-secondary)' }}>
              No engine has answered yet
            </p>
          )}
          <div className="flex flex-col gap-3 mt-3">
            {network.groups.map((group) => (
              <div key={group.line}>
                <div className="flex items-center gap-2 h-6">
                  <span aria-hidden="true" style={{ width: 16, height: 5, background: lineColor(group.line) }} />
                  <span className="text-[13px] font-bold flex-1" style={{ color: 'var(--color-text)' }}>
                    {LINE_NAMES[group.line] || 'Other'}
                  </span>
                  {group.modelCount > 0 && (
                    <span className="tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {group.modelCount} {group.modelCount === 1 ? 'model' : 'models'}
                    </span>
                  )}
                </div>
                <LineMap items={group.items} label={`${LINE_NAMES[group.line] || 'Other'} engines`} className="text-[14px]" />
              </div>
            ))}
          </div>
        </section>

        {/* Device */}
        <section aria-labelledby="sys-device">
          <SectionHeading id="sys-device">Device</SectionHeading>
          <dl className="mt-2">
            {energy?.cpu_temp_c != null && (
              <Figure label="CPU temp" value={`${Math.round(energy.cpu_temp_c)} °C`} />
            )}
            {energy?.gpu_temp_c != null && (
              <Figure label="GPU temp" value={`${Math.round(energy.gpu_temp_c)} °C`} />
            )}
            <Figure label="Power" value={`${(liveEnergy?.power_w ?? energy?.avg_power_w ?? 0).toFixed(1)} W`} />
            <Figure
              label="Energy"
              value={`${((liveEnergy?.energy_j ?? energy?.total_energy_j ?? 0) / 1000).toFixed(1)} kJ`}
            />
          </dl>
        </section>

        {/* This session: local cost against all-cloud */}
        <section aria-labelledby="sys-session">
          <SectionHeading id="sys-session">This session</SectionHeading>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Local</span>
            <span className="tn-mono text-[30px] leading-[36px] font-bold" style={{ color: 'var(--color-text)' }}>
              ${localCost.toFixed(4)}
            </span>
          </div>
          <p className="text-[13px] mt-3 mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            All-cloud would be
          </p>
          <dl style={{ borderTop: '1px solid var(--color-border)' }}>
            {CLOUD_PRICING.map((provider) => {
              const cost = (promptK * provider.input) / 1000 + (completionK * provider.output) / 1000;
              const saved = cost - localCost;
              return (
                <div
                  key={provider.name}
                  className="flex items-baseline justify-between gap-3 py-1.5"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <dt
                    className="text-[14px] truncate min-w-0"
                    style={{
                      color: provider.primary ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      fontWeight: provider.primary ? 700 : 400,
                    }}
                  >
                    {provider.name}
                  </dt>
                  <dd className="tn-mono text-right shrink-0">
                    <span className="text-[13px]" style={{ color: 'var(--color-text)' }}>${cost.toFixed(4)}</span>
                    {saved > 0.0001 && (
                      <span className="block text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        saved ${saved.toFixed(4)}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <dl className="mt-2">
            <Figure label="Requests" value={String(savings?.total_calls ?? telemetry?.total_requests ?? 0)} />
            <Figure label="Output tokens" value={formatNumber(savings?.total_completion_tokens ?? telemetry?.total_tokens ?? 0)} />
          </dl>
        </section>

        {/* Leaderboard / Share */}
        <section aria-labelledby="sys-leaderboard">
          <SectionHeading id="sys-leaderboard">Leaderboard</SectionHeading>
          <button
            type="button"
            onClick={() => setOptInModalOpen(true)}
            className="tn-btn w-full mt-3"
            style={{ justifyContent: 'space-between' }}
          >
            <span>{optInEnabled ? 'Sharing Savings' : 'Share Your Savings'}</span>
            <span
              className="tn-mono text-[12px]"
              style={{ color: optInEnabled ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: optInEnabled ? 700 : 400 }}
            >
              {optInEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
          <a
            href="https://open-jarvis.github.io/OpenJarvis/leaderboard"
            target="_blank"
            rel="noopener noreferrer"
            className="tn-link inline-flex items-center gap-1.5 mt-3 text-[13px]"
          >
            View Leaderboard
            <ExternalLink size={12} />
          </a>
        </section>
      </div>
    </aside>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd className="tn-mono text-[13px]" style={{ color: 'var(--color-text)' }}>{value}</dd>
    </div>
  );
}

interface NetworkGroup {
  line: Line;
  modelCount: number;
  items: LineMapItem[];
}

const LINE_ORDER: Line[] = ['local', 'cloud', 'tools', 'data', 'none'];

/**
 * The engines this conversation actually reached, plus the server's own
 * engine, grouped by line. Only real data: telemetry from assistant replies,
 * the /health reachability and the model list.
 */
function buildNetwork(
  messages: ChatMessage[],
  models: ModelInfo[],
  serverInfo: ServerInfo | null,
  apiReachable: boolean | null,
): { groups: NetworkGroup[]; engineCount: number } {
  const engines = new Map<string, LineMapItem>();
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    const engine = msg.telemetry?.engine;
    if (!engine) continue;
    const failed = msg.content.startsWith('Error:');
    let status: string;
    if (failed) {
      status = msg.content.match(/\b\d{3}\b/)?.[0] ?? 'error';
    } else {
      const total = msg.telemetry?.total_ms;
      status = total != null ? `ok \u00B7 ${formatMs(total)}` : 'ok';
    }
    // Later replies win: the status shows the last answer from each engine.
    engines.delete(engine);
    engines.set(engine, {
      id: engine,
      line: lineForEngine(engine),
      label: engine,
      status,
      state: failed ? 'failed' : 'open',
    });
  }

  const serverEngine = serverInfo?.engine;
  if (serverEngine && serverEngine !== 'multi' && !engines.has(serverEngine)) {
    engines.set(serverEngine, {
      id: serverEngine,
      line: lineForEngine(serverEngine),
      label: serverEngine,
      status: apiReachable === false ? 'offline' : apiReachable ? 'running' : 'checking',
      state: apiReachable === false ? 'failed' : apiReachable ? 'open' : 'unavailable',
    });
  }

  const modelCounts = new Map<Line, number>();
  for (const model of models) {
    const line = lineForModel(model.id, model.owned_by);
    modelCounts.set(line, (modelCounts.get(line) ?? 0) + 1);
  }

  const items = [...engines.values()];
  const groups = LINE_ORDER.map((line) => ({
    line,
    modelCount: modelCounts.get(line) ?? 0,
    items: items.filter((item) => item.line === line),
  })).filter((group) => group.modelCount > 0 || group.items.length > 0);

  return { groups, engineCount: items.length };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}