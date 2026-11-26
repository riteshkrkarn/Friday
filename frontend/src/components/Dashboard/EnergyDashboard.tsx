import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchEnergy, fetchTelemetry } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { SectionHeading } from '../transit';

interface EnergySample {
  timestamp: string;
  power_w: number;
  energy_j: number;
}

interface EnergyData {
  total_energy_j?: number;
  energy_per_token_j?: number;
  avg_power_w?: number;
  samples?: EnergySample[];
}

interface TelemetryStats {
  total_requests?: number;
  total_tokens?: number;
}

interface ChartPoint {
  time: string;
  power: number;
}

/** One ruled figure row: label at the left, the measured value in mono at the right. */
function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-2.5"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <dt className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd className="tn-mono text-[20px] leading-[26px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
        {value}
        {unit && (
          <span className="text-[13px] font-normal ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-hud)' };

export function EnergyDashboard() {
  const savings = useAppStore((s) => s.savings);
  const [energy, setEnergy] = useState<EnergyData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [energyRes, telRes] = await Promise.allSettled([
        fetchEnergy().catch(() => null),
        fetchTelemetry().catch(() => null),
      ]);

      if (energyRes.status === 'fulfilled' && energyRes.value) {
        const data = energyRes.value as EnergyData;
        setEnergy(data);
        if (data.samples) {
          setChartData(
            data.samples.map((s) => ({
              time: new Date(s.timestamp).toLocaleTimeString(),
              power: Math.round(s.power_w * 10) / 10,
            })),
          );
        }
        setError(null);
      }

      if (telRes.status === 'fulfilled' && telRes.value) {
        setTelemetry(telRes.value as TelemetryStats);
      }
    } catch {
      setError('Cannot connect to server');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const thermalStatus = (energy?.avg_power_w ?? 0) < 50
    ? { label: 'Cool' }
    : (energy?.avg_power_w ?? 0) < 150
    ? { label: 'Warm' }
    : { label: 'Hot' };

  if (error || !energy) {
    return (
      <section aria-labelledby="overview-energy">
        <SectionHeading as="h2" id="overview-energy">Energy Monitoring</SectionHeading>
        <div className="h-48 flex items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="tn-mono text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {error || 'awaiting telemetry stream…'}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="overview-energy">
      <SectionHeading as="h2" id="overview-energy">Energy Monitoring</SectionHeading>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <Figure label="Total Energy" value={((energy.total_energy_j ?? 0) / 1000).toFixed(1)} unit="kJ" />
        <Figure label="Energy / Token" value={(energy.energy_per_token_j ?? 0).toFixed(3)} unit="J" />
        <Figure label="Avg Power" value={(energy.avg_power_w ?? 0).toFixed(1)} unit="W" />
        <Figure label="Total Requests" value={String(savings?.total_calls ?? telemetry?.total_requests ?? 0)} />
        <Figure label="Thermal" value={thermalStatus.label} />
        <Figure label="Tokens Processed" value={formatNumber(savings?.total_tokens ?? telemetry?.total_tokens ?? 0)} />
      </dl>

      {chartData.length > 1 && (
        <figure className="mt-6">
          <figcaption className="text-[12px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Power draw on this device, watts
          </figcaption>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis
                  dataKey="time"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-input-border)' }}
                  minTickGap={24}
                />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} unit="W" width={48} />
                <Tooltip
                  cursor={{ stroke: 'var(--color-input-border)', strokeWidth: 1 }}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderTop: 'var(--rule-bar) solid var(--color-text)',
                    borderRadius: 2,
                    boxShadow: 'none',
                    fontSize: 12,
                    fontFamily: 'var(--font-hud)',
                    color: 'var(--color-text)',
                  }}
                  labelStyle={{ color: 'var(--color-text-tertiary)' }}
                  itemStyle={{ color: 'var(--color-text)' }}
                />
                <Line
                  type="linear"
                  dataKey="power"
                  stroke="var(--line-local)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, stroke: 'var(--line-local)', strokeWidth: 3, fill: 'var(--color-bg)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </section>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
