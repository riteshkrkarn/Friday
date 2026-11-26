import { useEffect, useState } from 'react';
import { useAppStore } from '../lib/store';
import { fetchManagedAgents } from '../lib/api';

type PulseState = 'idle' | 'inferencing' | 'agent-active';

export function SystemPulse({ apiReachable }: { apiReachable: boolean | null }) {
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const [hasRunningAgent, setHasRunningAgent] = useState(false);

  useEffect(() => {
    if (apiReachable === false) return;
    const check = () =>
      fetchManagedAgents()
        .then((agents) => setHasRunningAgent(agents.some((a) => a.status === 'running')))
        .catch(() => {});
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [apiReachable]);

  if (apiReachable === false) return null;

  let state: PulseState = 'idle';
  if (isStreaming) state = 'inferencing';
  else if (hasRunningAgent) state = 'agent-active';

  if (state === 'idle') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2px] z-50"
      style={{
        backgroundColor: 'var(--action)',
        opacity: state === 'inferencing' ? 1 : 0.5,
      }}
    />
  );
}
