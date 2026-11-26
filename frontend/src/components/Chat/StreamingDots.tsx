import type { CSSProperties } from 'react';
import { useAppStore } from '../../lib/store';
import { lineColor, lineForModel } from '../../lib/transit-lines';
import { Station } from '../transit';

interface Props {
  phase: string;
}

/** The head of the live route: a short line into an open station, plus the phase. */
export function StreamingDots({ phase }: Props) {
  const line = useAppStore((s) =>
    lineForModel(s.selectedModel, s.models.find((m) => m.id === s.selectedModel)?.owned_by),
  );
  return (
    <div className="flex items-center gap-3 py-2" role="status">
      <span className="flex items-center" aria-hidden="true">
        <span
          className="tn-seg"
          style={{ background: lineColor(line), width: 24, flex: 'none', margin: '0 -2px 0 0' } as CSSProperties}
        />
        <Station line={line} className="relative z-[1]" />
      </span>
      {phase && (
        <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
          {phase}
        </span>
      )}
    </div>
  );
}
