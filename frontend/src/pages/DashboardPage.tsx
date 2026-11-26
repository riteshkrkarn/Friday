import { EnergyDashboard } from '../components/Dashboard/EnergyDashboard';
import { CostComparison } from '../components/Dashboard/CostComparison';
import { TraceDebugger } from '../components/Dashboard/TraceDebugger';
import { PageHeader } from '../components/transit';

export function DashboardPage() {
  const now = new Date();
  const stamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
      <div className="max-w-[1120px] mx-auto pb-16">
        <PageHeader
          title="System Overview"
          actions={
            <time className="tn-mono text-[12px]" dateTime={now.toISOString()} style={{ color: 'var(--color-text-tertiary)' }}>
              {stamp}
            </time>
          }
        />
        <p className="text-[14px] mt-3 max-w-[65ch]" style={{ color: 'var(--color-text-secondary)' }}>
          Energy, token throughput, and cost savings across your local and cloud models.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-12 mt-8">
          <EnergyDashboard />
          <CostComparison />
        </div>
        <div className="mt-12">
          <TraceDebugger />
        </div>
      </div>
    </div>
  );
}
