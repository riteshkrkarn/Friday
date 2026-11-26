import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { isProfane } from '../lib/profanity';
import { fetchAnalyticsIdentity, saveAnalyticsPreference } from '../lib/analytics';

interface OptInModalProps {
  onClose: () => void;
}

export function OptInModal({ onClose }: OptInModalProps) {
  const setOptIn = useAppStore((s) => s.setOptIn);
  const optInDisplayName = useAppStore((s) => s.optInDisplayName);
  const optInEmail = useAppStore((s) => s.optInEmail);
  const optInEnabled = useAppStore((s) => s.optInEnabled);
  const [name, setName] = useState(optInDisplayName);
  const [email, setEmail] = useState(optInEmail);
  const [joined, setJoined] = useState(optInEnabled);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchAnalyticsIdentity()
      .then((identity) => { if (active) setAnalyticsEnabled(identity.enabled); })
      .catch(() => {
        if (active) setError('Could not load analytics. You can retry saving your choice.');
      })
      .finally(() => { if (active) setAnalyticsLoading(false); });
    return () => { active = false; };
  }, []);

  const handleJoin = async (enableAnalytics: boolean) => {
    if (saving || analyticsLoading) return;
    const trimmed = name.trim();
    const trimmedEmail = email.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      setError('Please enter a display name with 2–30 characters.');
      return;
    }
    if (isProfane(trimmed)) {
      setError('Please choose a different name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await saveAnalyticsPreference(enableAnalytics);
      setAnalyticsEnabled(enableAnalytics);
      setOptIn(true, trimmed, trimmedEmail);
      setJoined(true);
      setStatus(enableAnalytics ? 'Usage analytics enabled.' : 'Usage analytics are off.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your sharing choice.');
    } finally {
      setSaving(false);
    }
  };

  const handleAnalytics = async (enabled: boolean, close: boolean) => {
    if (saving || analyticsLoading) return;
    setError('');
    setSaving(true);
    try {
      await saveAnalyticsPreference(enabled);
      setAnalyticsEnabled(enabled);
      setStatus(enabled ? 'Usage analytics enabled.' : 'Usage analytics are off.');
      if (close) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your analytics choice.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || analyticsLoading;

  return (
    <div
      className="tn-scrim z-50 flex items-center justify-center p-4"
      onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharing-modal-title"
        className="tn-dialog relative w-full max-w-[480px] max-h-[90dvh] overflow-y-auto p-5 sm:p-6"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) onClose();
          if (event.key !== 'Tab') return;
          const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), a[href]',
          );
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <button
          type="button"
          aria-label="Close sharing choices"
          onClick={onClose}
          disabled={saving}
          className="tn-icon-btn absolute right-3 top-3"
        ><X size={16} /></button>

        <h2 id="sharing-modal-title" className="text-[24px] leading-[30px] font-bold pr-10 mb-2" style={{ color: 'var(--color-text)' }}>
          Win a Mac mini
        </h2>
        <p className="text-[15px] leading-[22px] mb-4" style={{ color: 'var(--color-text-secondary)', textWrap: 'pretty' }}>
          Share your savings on the leaderboard for a chance to win a Mac mini.
        </p>

        {error && <p role="alert" className="text-[13px] font-medium mb-3" style={{ color: 'var(--fail)' }}>{error}</p>}
        {status && <p role="status" className="text-[13px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>{status}</p>}

        {!joined && (
          <form
            id="sharing-entry-form"
            onSubmit={(event) => { event.preventDefault(); void handleJoin(false); }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4"
          >
            <div>
              <label htmlFor="sharing-display-name" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
                Display name (public)
              </label>
              <input
                id="sharing-display-name"
                type="text"
                value={name}
                disabled={saving}
                maxLength={30}
                onChange={(event) => { setName(event.target.value); setError(''); }}
                placeholder="Your leaderboard name"
                className="tn-input"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="sharing-contact-email" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
                Email (not displayed)
              </label>
              <input
                id="sharing-contact-email"
                type="email"
                value={email}
                disabled={saving}
                onChange={(event) => { setEmail(event.target.value); setError(''); }}
                placeholder="you@example.com"
                className="tn-input"
              />
            </div>
          </form>
        )}

        <div className="text-[13px] leading-5 mb-5 pt-3" style={{ color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)' }}>
          <p className="mb-1.5">
            Optional analytics sends usage counts, timings, errors, environment metadata,
            and a random ID to PostHog.
          </p>
          <p>
            Leaderboard entries send your name, email, and savings to Supabase.
            Your name and savings are public; email is not displayed.
          </p>
          <a
            href="https://open-jarvis.github.io/OpenJarvis/telemetry/"
            target="_blank"
            rel="noreferrer"
            className="tn-link inline-block mt-1.5"
          >Privacy details</a>
        </div>

        {joined ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] mb-2" style={{ color: 'var(--color-text)' }}>
              Leaderboard sharing enabled · Analytics {analyticsEnabled ? 'on' : 'off'}
            </p>
            <button
              type="button"
              onClick={() => void handleAnalytics(!analyticsEnabled, false)}
              disabled={busy}
              className="tn-btn tn-btn-primary w-full"
            >{saving ? 'Saving…' : analyticsEnabled ? 'Disable analytics' : 'Enable analytics'}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="tn-btn">Done</button>
              <button
                type="button"
                onClick={() => { setOptIn(false, '', ''); setJoined(false); onClose(); }}
                disabled={saving}
                className="tn-btn"
                style={{ whiteSpace: 'normal', height: 'auto', minHeight: 36 }}
              >Stop leaderboard updates</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleJoin(true)}
              disabled={busy}
              className="tn-btn tn-btn-primary w-full"
            >{saving ? 'Saving…' : 'Enable analytics & enter giveaway'}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" form="sharing-entry-form" disabled={busy} className="tn-btn" style={{ whiteSpace: 'normal', height: 'auto', minHeight: 36 }}>
                Enter giveaway only
              </button>
              <button type="button" onClick={() => void handleAnalytics(true, true)} disabled={busy} className="tn-btn" style={{ whiteSpace: 'normal', height: 'auto', minHeight: 36 }}>
                Enable analytics only
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleAnalytics(false, true)}
              disabled={busy}
              className="tn-btn w-full"
            >Continue without sharing</button>
          </div>
        )}
      </div>
    </div>
  );
}