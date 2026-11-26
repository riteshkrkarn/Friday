import { Volume2, Square } from 'lucide-react';
import { useTts } from '../../hooks/useTts';
import { useAppStore } from '../../lib/store';

interface Props {
  messageId: string;
  content: string;
}

/** Reads one assistant message aloud through the server's TTS backend. */
export function SpeakMessageButton({ messageId, content }: Props) {
  const voiceOutputEnabled = useAppStore((s) => s.settings.voiceOutputEnabled);
  const { speak, stop, speakingId, available, state, error, errorId } = useTts();

  if (!voiceOutputEnabled || !available) return null;

  // Playback is global, so this button reflects the shared utterance only when
  // that utterance is this message.
  const isMine = speakingId === messageId;
  const busy = isMine && (state === 'loading' || state === 'speaking');
  const messageError = errorId === messageId ? error : null;

  return (
    <>
      <button
        type="button"
        onClick={() => (busy ? stop() : speak(messageId, content))}
        className={`tn-btn tn-btn-ghost tn-btn-sm ${busy ? '' : 'tn-reveal'}`}
        style={{ color: busy ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
        title={
          messageError ||
          (isMine && state === 'loading'
            ? 'Synthesizing...'
            : isMine && state === 'speaking'
              ? 'Stop'
              : 'Read aloud')
        }
        aria-label={busy ? 'Stop reading message' : 'Read message aloud'}
      >
        {busy ? <Square size={14} /> : <Volume2 size={14} />}
        <span aria-hidden="true">{busy ? 'Stop' : 'Read aloud'}</span>
      </button>
      {messageError && (
        <span role="alert" className="text-[12px] font-medium" style={{ color: 'var(--fail)' }}>
          {messageError}
        </span>
      )}
    </>
  );
}