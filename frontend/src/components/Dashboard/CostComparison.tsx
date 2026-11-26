import { useAppStore } from '../../lib/store';
import { SectionHeading, Station } from '../transit';

const CLOUD_PRICING = [
  { name: 'GPT-5.6 Sol', input: 5.00, output: 30.00 },
  { name: 'Claude Fable 5', input: 10.00, output: 50.00 },
  { name: 'Gemini 3.1 Pro', input: 2.00, output: 12.00 },
];

export function CostComparison() {
  const savings = useAppStore((s) => s.savings);

  if (!savings || savings.total_tokens === 0) {
    return (
      <section aria-labelledby="overview-cost">
        <SectionHeading as="h2" id="overview-cost">Cost Comparison</SectionHeading>
        <div className="h-48 flex items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="tn-mono text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
            awaiting first inference…
          </span>
        </div>
      </section>
    );
  }

  const promptK = savings.total_prompt_tokens / 1000;
  const completionK = savings.total_completion_tokens / 1000;

  return (
    <section aria-labelledby="overview-cost">
      <SectionHeading as="h2" id="overview-cost">Cost Comparison*</SectionHeading>

      {/* Local: what this device actually spent */}
      <div className="flex items-start gap-3 py-4" style={{ borderBottom: '2px solid var(--color-text)' }}>
        <Station line="local" state="current" className="mt-[5px]" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold" style={{ color: 'var(--color-text)' }}>
            Local (your hardware)
          </div>
          <div className="tn-mono text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {savings.total_calls} requests · {savings.total_tokens.toLocaleString()} tokens
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="tn-mono text-[28px] leading-[32px] font-medium" style={{ color: 'var(--color-text)' }}>
            ${savings.local_cost.toFixed(4)}
          </div>
          <div className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
            electricity only
          </div>
        </div>
      </div>

      {/* The same tokens priced on all-cloud routes */}
      <table className="tn-table">
        <caption className="sr-only">Same tokens on cloud models</caption>
        <thead>
          <tr>
            <th scope="col">If sent to the cloud</th>
            <th scope="col" style={{ textAlign: 'right' }}>Cost</th>
            <th scope="col" style={{ textAlign: 'right', paddingRight: 0 }}>Saved</th>
          </tr>
        </thead>
        <tbody>
          {CLOUD_PRICING.map((provider) => {
            const cost = (promptK * provider.input / 1000) + (completionK * provider.output / 1000);
            const saved = cost - savings.local_cost;
            return (
              <tr key={provider.name}>
                <td>
                  <span className="inline-flex items-center gap-2.5">
                    <Station line="cloud" size={12} />
                    <span style={{ color: 'var(--color-text)' }}>{provider.name}</span>
                  </span>
                </td>
                <td className="tn-mono text-right" style={{ color: 'var(--color-text)' }}>
                  ${cost.toFixed(4)}
                </td>
                <td className="tn-mono text-right" style={{ color: 'var(--color-text-secondary)', paddingRight: 0 }}>
                  {saved > 0 ? `$${saved.toFixed(4)} saved` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[12px] leading-[18px] mt-3 max-w-[70ch]" style={{ color: 'var(--color-text-tertiary)' }}>
        *Savings estimates assume local models (e.g. Qwen, Nemotron, Kimi) produce roughly the same number of tokens per request, on average, as closed-source cloud models.
      </p>
    </section>
  );
}
