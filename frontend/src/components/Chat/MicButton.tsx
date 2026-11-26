import { useState } from 'react';
import type { SpeechState } from '../../hooks/useSpeech';

interface MicButtonProps {
  state: SpeechState;
  onClick: () => void;
  disabled?: boolean;
  reason?: 'not-enabled' | 'no-backend' | 'streaming';
}

export function MicButton({ state, onClick, disabled, reason }: MicButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipText =
    reason === 'not-enabled'
      ? 'Enable in Settings'
      : reason === 'no-backend'
        ? 'Speech backend not configured'
        : reason === 'streaming'
          ? 'Wait for response'
          : state === 'recording'
            ? 'Stop recording'
            : state === 'transcribing'
              ? 'Transcribing...'
              : 'Voice input';

  const isInactive = disabled || state === 'transcribing';

  const recording = state === 'recording';

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={isInactive}
        aria-label={tooltipText}
        aria-pressed={recording}
        className="tn-btn tn-btn-sm"
        style={{
          width: 32,
          padding: 0,
          background: recording ? 'var(--color-text)' : undefined,
          borderColor: recording ? 'var(--color-text)' : undefined,
          color: recording ? 'var(--color-bg)' : undefined,
        }}
      >
        {state === 'transcribing' ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.4" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z" />
            <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z" />
          </svg>
        )}
      </button>
      {showTooltip && isInactive && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[12px] whitespace-nowrap pointer-events-none z-10"
          style={{
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            borderRadius: 2,
          }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}