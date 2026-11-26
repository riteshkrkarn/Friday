import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useAppStore } from '../lib/store';
import {
  fetchManagedAgents,
  fetchAgentChannels,
  bindAgentChannel,
  unbindAgentChannel,
  createManagedAgent,
  sendblueRegisterWebhook,
  sendblueHealth,
  getMemoryStats,
  searchMemory,
  storeMemory,
  indexMemoryPath,
} from '../lib/api';
import type { ChannelBinding, ManagedAgent, MemoryStats, MemorySearchResult } from '../lib/api';
import { getBase, isTauri, authHeaders } from '../lib/api';
import { FolderOpen } from 'lucide-react';
import { SOURCE_CATALOG } from '../types/connectors';
import type { ConnectRequest, ConnectorMeta, SyncStatus, OAuthSetupInfo } from '../types/connectors';
import { listConnectors, connectSource, disconnectSourceUntilComplete, getConnector, getSyncStatus, triggerSync, startServerOAuth } from '../lib/connectors-api';
import { LineBullet, SectionHeading, Station } from '../components/transit';
import type { StationState } from '../lib/transit-lines';

// ---------------------------------------------------------------------------
// Transit pieces local to this page
// ---------------------------------------------------------------------------

/** Vertical offset of a station from the top of its stop row (row header is 56px). */
const STOP_Y = 21;

/**
 * One stop on a vertical line. The rail runs through the left gutter, the
 * station sits level with the row's first line, and the content is ruled
 * underneath so long forms below the header keep the line continuous.
 */
function LineStop({
  first,
  last,
  rail,
  station,
  children,
}: {
  first: boolean;
  last: boolean;
  /** CSS colour of the rail. */
  rail: string;
  station: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="relative" style={{ paddingLeft: 32 }}>
      {!first && (
        <span aria-hidden="true" className="absolute" style={{ left: 4.5, width: 5, top: 0, height: STOP_Y + 7, background: rail }} />
      )}
      {!last && (
        <span aria-hidden="true" className="absolute" style={{ left: 4.5, width: 5, top: STOP_Y + 7, bottom: 0, background: rail }} />
      )}
      <span className="absolute z-[1] flex" style={{ left: 0, top: STOP_Y }}>
        {station}
      </span>
      {children}
    </li>
  );
}

/** Small numbered list for setup instructions: the order is the information. */
function StepList({ children }: { children: ReactNode[] }) {
  return (
    <ol className="flex flex-col" style={{ borderTop: '1px solid var(--color-border)' }}>
      {children.map((child, i) => (
        <li
          key={i}
          className="grid gap-3 py-2.5 text-[13px] leading-5"
          style={{ gridTemplateColumns: '20px 1fr', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        >
          <span className="tn-mono text-[12px] leading-5" style={{ color: 'var(--color-text-tertiary)' }}>{i + 1}</span>
          <div className="min-w-0">{child}</div>
        </li>
      ))}
    </ol>
  );
}

const linkStyle = { color: 'var(--action)', textDecoration: 'underline', textUnderlineOffset: 3 } as const;
const hintStyle = { fontSize: 13, lineHeight: '20px', color: 'var(--color-text-secondary)', marginBottom: 12 } as const;

/** A 5px line that fills from the left as a multi-stage action advances. */
function LineFill({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div aria-hidden="true" style={{ height: 5, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%', width: '100%', background: color,
          transform: `scaleX(${Math.max(0, Math.min(1, fraction))})`,
          transformOrigin: 'left center',
          transition: 'transform 200ms ease-out',
        }}
      />
    </div>
  );
}

/** Inline failure message with the red rule over it. */
function FailRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`tn-rule-fail pt-2 text-[13px] leading-5 ${className}`}
      style={{ color: 'var(--fail)', overflowWrap: 'anywhere' }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline connect form (reused from AgentsPage pattern)
// ---------------------------------------------------------------------------

function InlineConnectForm({
  fields,
  loading,
  disabled = false,
  onSubmit,
}: {
  fields: NonNullable<ConnectorMeta['inputFields']>;
  loading: boolean;
  disabled?: boolean;
  onSubmit: (req: ConnectRequest) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue || ''])),
  );

  const update = (name: string, value: string) =>
    setInputs((p) => ({ ...p, [name]: value }));

  const allFilled = fields
    .filter((field) => field.required !== false)
    .every((field) => inputs[field.name]?.trim());
  const submitDisabled = loading || disabled || !allFilled;

  const submit = () => {
    const req: ConnectRequest = {};
    for (const f of fields) {
      if (f.name === 'email') req.email = inputs.email;
      else if (f.name === 'password') req.password = inputs.password;
      else if (f.name === 'token') req.token = inputs.token;
      else if (f.name === 'path') req.path = inputs.path;
      else if (f.name === 'host' && inputs.host?.trim()) req.host = inputs.host.trim();
      else if (f.name === 'port' && inputs.port?.trim()) req.port = Number(inputs.port);
      else if (f.name === 'security' && (inputs.security === 'tls' || inputs.security === 'starttls')) {
        req.security = inputs.security;
      }
      else req.config = { ...(req.config || {}), [f.name]: inputs[f.name] };
    }
    if (req.email && req.password) {
      req.token = `${req.email}:${req.password}`;
      req.code = req.token;
    }
    if (req.token && !req.code) req.code = req.token;
    onSubmit(req);
  };

  return (
    <div className="flex flex-col gap-2">
      {fields.map((f) => (
        f.type === 'select' ? (
          <select
            key={f.name}
            value={inputs[f.name] || f.defaultValue || ''}
            onChange={(e) => update(f.name, e.target.value)}
            aria-label={f.placeholder}
            className="tn-select"
          >
            {(f.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            key={f.name}
            value={inputs[f.name] || ''}
            onChange={(e) => update(f.name, e.target.value)}
            placeholder={f.placeholder}
            aria-label={f.placeholder}
            type={f.type || 'text'}
            required={f.required !== false}
            className="tn-input"
          />
        )
      ))}
      <button
        type="button"
        onClick={submit}
        disabled={submitDisabled}
        className="tn-btn tn-btn-primary self-start mt-1"
      >
        Connect
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic fallback connect panel — for any backend connector that has no
// hardcoded SOURCE_CATALOG entry (no `steps`). Without this, expanding such
// a connector's "+ Add" card rendered nothing at all: no button, no input,
// no explanation, just an empty box (e.g. Spotify, Strava, Oura, GitHub
// Notifications, Google Tasks, Weather, and the Apple/News local sources).
// Branches on auth_type using the same primitives the hardcoded catalog
// entries already use (InlineConnectForm, oauth start+poll).
// ---------------------------------------------------------------------------

function GenericConnectPanel({
  connectorId,
  displayName,
  authType,
  loading,
  disabled = false,
  onConnect,
  onOAuthStart,
}: {
  connectorId: string;
  displayName: string;
  authType: string;
  loading: boolean;
  disabled?: boolean;
  onConnect: (req: ConnectRequest) => void;
  onOAuthStart: () => void;
}) {
  const [oauthSetup, setOauthSetup] = useState<OAuthSetupInfo | null>(null);
  const [feedUrls, setFeedUrls] = useState('');

  useEffect(() => {
    if (authType !== 'oauth') return;
    let cancelled = false;
    getConnector(connectorId)
      .then((info) => {
        if (!cancelled) setOauthSetup(info.oauth_setup ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectorId, authType]);

  if (authType === 'local') {
    if (connectorId === 'news_rss') {
      const feeds = feedUrls
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ url }));
      return (
        <div>
          <div style={hintStyle}>
            Add one RSS or Atom feed URL per line.
          </div>
          <textarea
            value={feedUrls}
            onChange={(event) => setFeedUrls(event.target.value)}
            placeholder={'https://example.com/feed.xml\nhttps://example.org/rss'}
            aria-label="Feed URLs"
            rows={4}
            className="tn-textarea tn-mono text-[13px]"
          />
          <button
            type="button"
            onClick={() => onConnect({ config: { feeds } })}
            disabled={loading || disabled || feeds.length === 0}
            className="tn-btn tn-btn-primary mt-3"
          >
            {loading ? 'Connecting...' : 'Save feeds'}
          </button>
        </div>
      );
    }
    return (
      <div>
        <div style={hintStyle}>
          {displayName} reads data directly from this device. Grant access if
          prompted, then connect.
        </div>
        <button
          type="button"
          onClick={() => onConnect({})}
          disabled={loading || disabled}
          className="tn-btn tn-btn-primary"
        >
          {loading ? 'Connecting...' : `Connect ${displayName}`}
        </button>
      </div>
    );
  }

  if (authType === 'token') {
    return (
      <div>
        <div style={hintStyle}>
          Enter your {displayName} API token.
        </div>
        <InlineConnectForm
          fields={connectorId === 'weather'
            ? [
                { name: 'token', placeholder: 'OpenWeather API key', type: 'password' },
                { name: 'location', placeholder: 'City, country (for example: Boston,US)', type: 'text' },
              ]
            : [{ name: 'token', placeholder: `${displayName} API token`, type: 'password' }]}
          loading={loading}
          disabled={disabled}
          onSubmit={onConnect}
        />
      </div>
    );
  }

  // auth_type === 'oauth' (default for anything else without a catalog entry)
  if (oauthSetup?.has_credentials) {
    return (
      <div>
        <div style={hintStyle}>
          OAuth app credentials are already configured. Continue directly to
          {oauthSetup.provider ? ` ${oauthSetup.provider}` : ' the provider'} sign-in.
        </div>
        <button
          type="button"
          onClick={onOAuthStart}
          disabled={loading || disabled}
          className="tn-btn tn-btn-primary"
        >
          {loading ? 'Connecting...' : `Continue with ${oauthSetup.provider || displayName}`}
        </button>
      </div>
    );
  }

  return (
    <div>
      {oauthSetup && !oauthSetup.has_credentials && (
        <div className="tn-rule-top pt-2 mb-4 text-[13px] leading-5" style={{ color: 'var(--color-text)' }}>
          <p>
            <strong className="font-bold">Setup required.</strong> {oauthSetup.setup_hint}
          </p>
          <a
            href={oauthSetup.setup_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1"
            style={linkStyle}
          >
            Open developer dashboard &rarr;
          </a>
        </div>
      )}
      <div style={hintStyle}>
        Paste the Client ID and Client Secret from the app you created above.
      </div>
      <InlineConnectForm
        fields={[
          { name: 'email', placeholder: 'Client ID', type: 'text' },
          { name: 'password', placeholder: 'Client Secret', type: 'password' },
        ]}
        loading={loading}
        disabled={disabled}
        onSubmit={onConnect}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload / Paste form
// ---------------------------------------------------------------------------

const ACCEPTED_EXTENSIONS = '.txt,.md,.pdf,.docx,.csv';

function UploadForm({ onDone }: { onDone?: () => void }) {
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const handlePaste = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const res = await fetch(`${getBase()}/v1/connectors/upload/ingest`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title: title.trim(), content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(`Added ${data.chunks_added} chunk${data.chunks_added !== 1 ? 's' : ''} to knowledge base`);
      setTitle('');
      setContent('');
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      if (title.trim()) formData.append('title', title.trim());

      const res = await fetch(`${getBase()}/v1/connectors/upload/ingest/files`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(`Added ${data.chunks_added} chunk${data.chunks_added !== 1 ? 's' : ''} from ${files.length} file${files.length !== 1 ? 's' : ''}`);
      setFiles([]);
      setTitle('');
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="tn-tabs" role="tablist" aria-label="Add content">
        <button type="button" role="tab" aria-selected={tab === 'paste'} className="tn-tab" onClick={() => setTab('paste')}>
          Paste Text
        </button>
        <button type="button" role="tab" aria-selected={tab === 'upload'} className="tn-tab" onClick={() => setTab('upload')}>
          Upload Files
        </button>
      </div>

      {/* Title input (shared) */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        aria-label="Title (optional)"
        className="tn-input"
      />

      {tab === 'paste' && (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your text here..."
            aria-label="Text to add"
            rows={6}
            className="tn-textarea"
            style={{ minHeight: 120 }}
          />
          <button
            type="button"
            onClick={handlePaste}
            disabled={busy || !content.trim()}
            className="tn-btn tn-btn-primary self-start"
          >
            {busy ? 'Adding...' : 'Add to Knowledge Base'}
          </button>
        </>
      )}

      {tab === 'upload' && (
        <>
          <input
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            aria-label="Files to upload"
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              setFiles(selected);
            }}
            className="tn-input text-[13px]"
            style={{ height: 'auto', padding: 6 }}
          />
          {files.length > 0 && (
            <div className="tn-mono text-[12px]" style={{ color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
              {files.map((f) => f.name).join(', ')}
            </div>
          )}
          <button
            type="button"
            onClick={handleUpload}
            disabled={busy || files.length === 0}
            className="tn-btn tn-btn-primary self-start"
          >
            {busy ? 'Uploading...' : 'Upload & Index'}
          </button>
        </>
      )}

      {result && (
        <div role="status" className="text-[13px]" style={{ color: 'var(--color-text)' }}>
          {result}
        </div>
      )}
      {error && <FailRow>{error}</FailRow>}
    </div>
  );
}

// The Gmail card unifies the OAuth (`gmail`) and IMAP (`gmail_imap`) backend
// connectors — both should resolve to the gmail_imap catalog entry so the
// connected card shows the same name, unit label, and troubleshooting tips
// regardless of which underlying flow the user picked.
function metaFor(connectorId: string) {
  const id = connectorId === 'gmail' ? 'gmail_imap' : connectorId;
  return SOURCE_CATALOG.find((s) => s.connector_id === id);
}

// Advanced OAuth disclosure for the unified Gmail card. Hidden by default;
// expands to a Client ID + Client Secret form that POSTs to the OAuth
// `gmail` backend connector. Lives here rather than in SOURCE_CATALOG
// because the Gmail card is the only one with a dual-flow shape.
function GmailOAuthAdvanced({
  loading,
  disabled = false,
  onConnect,
}: {
  loading: boolean;
  disabled?: boolean;
  onConnect: (req: ConnectRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        className="tn-btn tn-btn-ghost tn-btn-sm"
        style={{ paddingLeft: 0, color: 'var(--color-text-secondary)', textDecoration: 'underline', textUnderlineOffset: 3 }}
      >
        {open ? 'Hide advanced' : 'Advanced: Connect with Google OAuth'}
      </button>
      {open && (
        <div className="tn-panel mt-2 p-4" style={{ background: 'var(--color-bg)' }}>
          <div style={hintStyle}>
            For developers with an existing Google Cloud project. Enable the
            Gmail API and create a Desktop OAuth client at{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Google Cloud Credentials →
            </a>{' '}
            then paste the Client ID and Client Secret below.
          </div>
          <InlineConnectForm
            fields={[
              { name: 'email', placeholder: 'Client ID', type: 'text' },
              { name: 'password', placeholder: 'Client Secret', type: 'password' },
            ]}
            loading={loading}
            disabled={disabled}
            onSubmit={onConnect}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Sources section
// ---------------------------------------------------------------------------

// Sync status display component with progress bar
function formatTimeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return 'less than a min ago';
  if (diffSec < 3600) {
    const m = Math.round(diffSec / 60);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.round(diffSec / 3600);
    return `${h} hr${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.round(diffSec / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Render how far back the corpus extends, given the oldest indexed
 *  item's timestamp. Returns null when there isn't enough data yet. */
function formatBacklogRange(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = (Date.now() - t) / 86400_000;
  if (days < 7) return 'past few days';
  if (days < 30) return 'past month';
  if (days < 90) return 'past 3 months';
  if (days < 365) return 'past year';
  const years = Math.round(days / 365);
  return `past ${years} year${years === 1 ? '' : 's'}`;
}

export function SyncStatusDisplay({
  chunks,
  sync,
  unitLabel,
  connectorId,
  disabled = false,
  onSyncTriggered,
}: {
  chunks: number;
  sync: SyncStatus | undefined;
  unitLabel: string;
  connectorId: string;
  disabled?: boolean;
  onSyncTriggered: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  const handleSync = async () => {
    if (disabled || sync?.state === 'stopping') return;
    setSyncing(true);
    setSyncError('');
    try {
      await triggerSync(connectorId);
      onSyncTriggered();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Disconnect cleanup only begins after the active sync worker exits. Keep
  // every competing lifecycle action unavailable while the backend reports
  // this transitional state; the disconnect handler retries automatically.
  if (sync?.state === 'stopping') {
    return (
      <div className="text-[13px] leading-5">
        <div style={{ color: 'var(--color-text)', fontWeight: 500 }}>
          Disconnect pending — waiting for the active sync to stop.
        </div>
        <div style={{ color: 'var(--color-text-tertiary)' }}>
          Indexed data will be cleaned up before this source disconnects.
        </div>
      </div>
    );
  }

  // Error state
  if (sync?.error) {
    return (
      <div className="flex flex-col items-start gap-2 text-[13px] leading-5">
        <div style={{ color: 'var(--fail)', fontWeight: 500, overflowWrap: 'anywhere' }}>
          Error: {sync.error}
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || disabled}
          className="tn-btn tn-btn-sm"
        >{syncing ? 'Retrying...' : 'Retry Sync'}</button>
      </div>
    );
  }

  // Treat the SyncEngine's checkpointed items_synced as the source of
  // truth for "total indexed" — `chunks` from listConnectors counts
  // embedding chunks (often != source items) and the checkpoint is what
  // both the syncing and idle branches need to display consistently.
  const totalIndexed = sync?.items_synced ?? chunks;
  const itemsTotal = sync?.items_total ?? 0;
  const backlogRange = formatBacklogRange(sync?.oldest_item_date);
  // "Complete inbox" — the user has indexed everything reachable. Only
  // surface this label when idle (during a sync we always show how far
  // back we've gotten so far).
  const isComplete =
    totalIndexed > 0 && itemsTotal > 0 && totalIndexed >= itemsTotal;

  // Actively syncing — single status line + reassurance line.
  if (sync?.state === 'syncing' || syncing) {
    const rangeLabel = backlogRange ?? 'building corpus';
    return (
      <div className="text-[13px] leading-5">
        <div style={{ color: 'var(--color-text)' }}>
          Indexed{' '}
          <span key={totalIndexed} className="sync-bump tn-mono">
            {totalIndexed.toLocaleString()} {unitLabel}
          </span>{' '}
          <span style={{ color: 'var(--color-text-secondary)' }}>
            ({rangeLabel})
          </span>{' '}
          <span style={{ color: 'var(--color-text-secondary)' }}>
            · Still indexing…
          </span>
        </div>
        <div style={{ color: 'var(--color-text-tertiary)' }}>
          Deep Research available now · results improve as more {unitLabel} are indexed
        </div>
      </div>
    );
  }

  // Idle — already has indexed items: show the corpus size + range or
  // "complete inbox" label, plus how long ago we last refreshed it.
  if (totalIndexed > 0) {
    const lastSyncLabel = formatTimeAgo(sync?.last_sync);
    const rangeLabel = isComplete
      ? 'complete inbox'
      : backlogRange;
    return (
      <div className="text-[13px] leading-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span style={{ color: 'var(--color-text)' }}>
            Indexed <span className="tn-mono">{totalIndexed.toLocaleString()} {unitLabel}</span>
            {rangeLabel && (
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {' '}({rangeLabel})
              </span>
            )}
            {lastSyncLabel && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                {' · '}Last synced {lastSyncLabel}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || disabled}
            className="tn-btn tn-btn-ghost tn-btn-sm"
            style={{ height: 24, padding: '0 6px', color: 'var(--color-text-secondary)' }}
          >{syncing ? '...' : 'Re-sync'}</button>
        </div>
        {syncError && (
          <div className="mt-1" style={{ color: 'var(--fail)', fontWeight: 500 }}>
            {syncError}
          </div>
        )}
      </div>
    );
  }

  // Connected but nothing ever ingested. Mirror the original copy.
  const hasSynced = sync?.last_sync != null;
  return (
    <div className="text-[13px] leading-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {hasSynced
            ? `Synced — 0 ${unitLabel} found`
            : 'Connected — not synced yet'}
        </span>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || disabled}
          className="tn-btn tn-btn-sm"
        >{syncing ? 'Syncing...' : hasSynced ? 'Re-sync' : 'Sync Now'}</button>
      </div>
      {hasSynced && connectorId === 'slack' && (
        <div className="mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Tip: invite the bot to channels with /invite @OpenJarvis, then re-sync
        </div>
      )}
      {syncError && (
        <div className="mt-1" style={{ color: 'var(--fail)', fontWeight: 500 }}>
          {syncError}
        </div>
      )}
    </div>
  );
}

function DataSourcesSection() {
  const cachedConnectors = useAppStore((s) => s.cachedConnectors);
  const setCachedConnectors = useAppStore((s) => s.setCachedConnectors);
  const connectors = cachedConnectors ?? [];
  const isFirstLoad = cachedConnectors === null;
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<{ id: string; message: string } | null>(null);
  const disconnectAbortRef = useRef<AbortController | null>(null);

  const loadConnectors = useCallback(async () => {
    try {
      const list = await listConnectors();
      setCachedConnectors(
        list.map((c) => ({
          connector_id: c.connector_id,
          display_name: c.display_name,
          connected: c.connected,
          chunks: (c as any).chunks || 0,
          auth_type: c.auth_type,
        })),
      );
    } catch {
      // The periodic refresh will try again.
    }
  }, [setCachedConnectors]);

  const setConnectors = setCachedConnectors;

  // Poll sync status for connected sources
  const loadSyncStatuses = useCallback(async () => {
    const connected = connectors.filter((c) => c.connected);
    const statuses: Record<string, SyncStatus> = {};
    await Promise.all(
      connected.map(async (c) => {
        try {
          statuses[c.connector_id] = await getSyncStatus(c.connector_id);
        } catch { /* */ }
      }),
    );
    setSyncStatuses((prev) => ({ ...prev, ...statuses }));
  }, [connectors]);

  useEffect(() => {
    void loadConnectors();
    const interval = setInterval(() => void loadConnectors(), 10000);
    return () => clearInterval(interval);
  }, [loadConnectors]);

  useEffect(() => {
    if (connectors.some((c) => c.connected)) {
      loadSyncStatuses();
      const interval = setInterval(loadSyncStatuses, 5000);
      return () => clearInterval(interval);
    }
  }, [connectors, loadSyncStatuses]);

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectStage, setConnectStage] = useState<string>('');
  const [connectError, setConnectError] = useState<string>('');

  useEffect(() => () => disconnectAbortRef.current?.abort(), []);

  const handleDisconnect = async (id: string) => {
    if (disconnectAbortRef.current || loading) return;
    const controller = new AbortController();
    disconnectAbortRef.current = controller;
    setDisconnectingId(id);
    setDisconnectError(null);
    try {
      await disconnectSourceUntilComplete(id, {
        signal: controller.signal,
        onPending: () => {
          setSyncStatuses((prev) => {
            const current = prev[id];
            return {
              ...prev,
              [id]: {
                state: 'stopping',
                items_synced: current?.items_synced ?? 0,
                items_total: current?.items_total ?? 0,
                new_items_synced: current?.new_items_synced ?? null,
                oldest_item_date: current?.oldest_item_date ?? null,
                last_sync: current?.last_sync ?? null,
                error: null,
              },
            };
          });
        },
      });
      setSyncStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadConnectors();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setDisconnectError({
          id,
          message: err instanceof Error ? err.message : 'Disconnect failed',
        });
      }
    } finally {
      if (disconnectAbortRef.current === controller) {
        disconnectAbortRef.current = null;
        setDisconnectingId(null);
      }
    }
  };

  const handleConnect = async (id: string, req: ConnectRequest | null) => {
    if (loading || disconnectAbortRef.current) return;
    setLoading(true);
    setConnectingId(id);
    setConnectStage('Connecting...');
    setConnectError('');
    try {
      const resp = req === null ? null : await connectSource(id, req);

      // OAuth connectors (Google Drive/Calendar/Contacts/Gmail/Tasks): pasting
      // a Client ID / Secret only registers the app credentials. The backend
      // returns `oauth_required` with the path to the in-process consent flow,
      // which is the only path that actually mints an access token. Open it now
      // and wait for the callback to flip the connector to connected. Without
      // this the connector would stay "pending" forever — the exact #512 bug.
      if (req === null || resp?.status === 'oauth_required') {
        setConnectStage('Opening provider sign-in...');
        await startServerOAuth(id, resp?.oauth_start);
      }

      setConnectStage('Connected! Starting sync...');

      // Wait for connector to show as connected
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const updated = await listConnectors();
        const target = updated.find((c) => c.connector_id === id);
        if (target?.connected) {
          setConnectors(updated.map((c) => ({
            connector_id: c.connector_id,
            display_name: c.display_name,
            connected: c.connected,
            chunks: (c as any).chunks || 0,
            auth_type: c.auth_type,
          })));
          break;
        }
        setConnectStage(i < 5 ? 'Authenticating...' : 'Waiting for connection...');
      }

      // Trigger sync
      setConnectStage('Syncing data...');
      try {
        await triggerSync(id);
      } catch { /* sync may already be running */ }

      // Close form after a brief moment
      await new Promise((r) => setTimeout(r, 1500));
      setExpandedId(null);
      loadConnectors();
      loadSyncStatuses();
    } catch (err: any) {
      let errorMsg = err.message || 'Connection failed';
      if (id === 'gmail_imap' && (errorMsg.includes('auth') || errorMsg.includes('credentials') || errorMsg.includes('LOGIN'))) {
        errorMsg = 'Invalid credentials — make sure you\'re using an App Password (16 characters), not your regular Gmail password.';
      }
      setConnectError(errorMsg);
      setConnectStage('');
    } finally {
      setLoading(false);
      setConnectingId(null);
      setConnectStage('');
    }
  };

  // Merge the OAuth Gmail (`gmail`) and IMAP Gmail (`gmail_imap`) backend
  // connectors into a single user-facing Gmail card. IMAP is the default
  // flow (no Google Cloud setup needed); OAuth lives behind an "Advanced"
  // disclosure when the card is expanded. If both happen to be connected,
  // keep whichever has more indexed chunks so the active source still
  // surfaces its sync state.
  const unifiedConnectors = (() => {
    const gmail = connectors.find((c) => c.connector_id === 'gmail');
    const gmailImap = connectors.find((c) => c.connector_id === 'gmail_imap');
    if (!gmail || !gmailImap) return connectors;
    if (gmail.connected && !gmailImap.connected) {
      return connectors.filter((c) => c.connector_id !== 'gmail_imap');
    }
    if (gmailImap.connected && !gmail.connected) {
      return connectors.filter((c) => c.connector_id !== 'gmail');
    }
    if (gmail.connected && gmailImap.connected) {
      const dropId = gmail.chunks >= gmailImap.chunks ? 'gmail_imap' : 'gmail';
      return connectors.filter((c) => c.connector_id !== dropId);
    }
    // Neither connected — show only the IMAP card as the default flow.
    return connectors.filter((c) => c.connector_id !== 'gmail');
  })();

  const connected = unifiedConnectors.filter((c) => c.connected);
  const notConnectedBase = unifiedConnectors.filter((c) => !c.connected);
  // Always show the upload card in the not-connected list (it has no backend connector)
  const uploadEntry = { connector_id: 'upload', display_name: 'Upload / Paste', connected: false, chunks: 0, auth_type: 'local' };
  const notConnected = notConnectedBase.some((c) => c.connector_id === 'upload')
    ? notConnectedBase
    : [...notConnectedBase, uploadEntry];
  const connectorActionsBusy = loading || disconnectingId !== null;

  const reduceMotion = useReducedMotion();
  const openTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: 'easeOut' as const };

  if (isFirstLoad) {
    return (
      <section aria-busy="true" aria-labelledby="ds-loading">
        <SectionHeading id="ds-loading">Loading sources…</SectionHeading>
        <ul className="mt-1">
          {[0, 1, 2, 3].map((i) => (
            <LineStop
              key={i}
              first={i === 0}
              last={i === 3}
              rail="var(--color-border)"
              station={<Station line="none" state="unavailable" />}
            >
              <div
                className="flex flex-col justify-center gap-2"
                style={{ height: 56, borderBottom: '1px solid var(--color-border)' }}
              >
                <div className="data-skeleton" style={{ height: 12, width: `${36 - i * 5}%` }} />
                <div className="data-skeleton" style={{ height: 10, width: `${58 - i * 7}%`, opacity: 0.6 }} />
              </div>
            </LineStop>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Connected sources: filled stations on the data line */}
      {connected.length > 0 && (
        <section aria-labelledby="ds-connected">
          <SectionHeading
            id="ds-connected"
            actions={<span className="tn-mono" style={{ color: 'var(--color-text-secondary)' }}>{connected.length}</span>}
          >
            Connected
          </SectionHeading>
          <ul className="mt-1">
          {connected.map((c, i) => {
            const meta = metaFor(c.connector_id);
            const unit = meta?.unitLabel || 'items';
            const sync = syncStatuses[c.connector_id];
            const failed = !!sync?.error || disconnectError?.id === c.connector_id;
            const state: StationState = failed ? 'failed' : 'current';
            return (
              <LineStop
                key={c.connector_id}
                first={i === 0}
                last={i === connected.length - 1}
                rail="var(--line-data)"
                station={<Station line="data" state={state} />}
              >
                <div
                  className="flex items-start gap-4"
                  style={{ padding: '17px 0 14px', borderBottom: '1px solid var(--color-border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] leading-[22px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                      {meta?.display_name ?? c.display_name}
                    </div>
                    <div className="mt-0.5">
                      <SyncStatusDisplay
                        chunks={c.chunks}
                        sync={sync}
                        unitLabel={unit}
                        connectorId={c.connector_id}
                        disabled={connectorActionsBusy}
                        onSyncTriggered={loadConnectors}
                      />
                    </div>
                    {disconnectError?.id === c.connector_id && (
                      <FailRow className="mt-2">
                        Disconnect failed: {disconnectError.message}
                      </FailRow>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(c.connector_id)}
                    disabled={connectorActionsBusy}
                    className="tn-btn tn-btn-sm shrink-0"
                    style={{ marginTop: -3 }}
                  >
                    {disconnectingId === c.connector_id
                      ? sync?.state === 'stopping' ? 'Cleaning up…' : 'Disconnecting…'
                      : sync?.state === 'stopping' ? 'Finish disconnect' : 'Disconnect'}
                  </button>
                </div>
              </LineStop>
            );
          })}
          </ul>
        </section>
      )}

      {/* Not connected: open stations on a line not yet in service */}
      {notConnected.length > 0 && (
        <section aria-labelledby="ds-available">
          <SectionHeading
            id="ds-available"
            actions={<span className="tn-mono" style={{ color: 'var(--color-text-secondary)' }}>{notConnected.length}</span>}
          >
            Available
          </SectionHeading>
          <ul className="mt-1">
          {notConnected.map((c, i) => {
            const meta = metaFor(c.connector_id);
            const isExpanded = expandedId === c.connector_id;
            const panelId = `ds-connect-${c.connector_id}`;
            const isConnecting = connectingId === c.connector_id && !!connectStage;
            const showError = !!connectError && connectingId === null && expandedId === c.connector_id;
            const toggle = () => setExpandedId(isExpanded ? null : c.connector_id);

            return (
              <LineStop
                key={c.connector_id}
                first={i === 0}
                last={i === notConnected.length - 1}
                rail="var(--color-border)"
                station={<Station line="data" state={showError ? 'failed' : isConnecting ? 'current' : 'open'} />}
              >
                <div style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div
                  className="flex items-start gap-4 cursor-pointer"
                  style={{ padding: '17px 0 14px' }}
                  onClick={toggle}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] leading-[22px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                      {meta?.display_name ?? c.display_name}
                    </div>
                    <div className="text-[13px] leading-5 mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {meta?.description ?? 'Not connected'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggle(); }}
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? panelId : undefined}
                    className={`tn-btn tn-btn-sm shrink-0 ${isExpanded ? 'tn-btn-ghost' : ''}`}
                    style={{ marginTop: -3 }}
                  >
                    {isExpanded ? 'Close' : c.connector_id === 'upload' ? 'Add' : 'Connect'}
                  </button>
                </div>

                {isExpanded && (
                  <motion.div
                    id={panelId}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={openTransition}
                    className="tn-panel mb-4 p-4 md:p-5"
                    style={{ maxWidth: 640 }}
                  >
                    {c.connector_id === 'upload' && (
                      <>
                        <div style={hintStyle}>
                          Paste text or upload files (.txt, .md, .pdf, .docx, .csv) to add them to your knowledge base.
                        </div>
                        <UploadForm onDone={loadConnectors} />
                      </>
                    )}

                    {c.connector_id !== 'upload' && meta?.steps && (
                      <>
                        <StepList>
                          {meta.steps.map((step, si) => (
                            <div key={si}>
                              <div>{step.label}</div>
                              {step.url && (
                                <a
                                  href={step.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-0.5"
                                  style={linkStyle}
                                >
                                  {step.urlLabel || 'Open'} &rarr;
                                </a>
                              )}
                            </div>
                          ))}
                        </StepList>
                        {meta?.inputFields && (
                          <div className="mt-4">
                            <InlineConnectForm
                              fields={meta.inputFields}
                              loading={loading && connectingId === c.connector_id}
                              disabled={connectorActionsBusy}
                              onSubmit={(req) => handleConnect(c.connector_id, req)}
                            />
                          </div>
                        )}
                        {c.connector_id === 'gmail_imap' && (
                          <GmailOAuthAdvanced
                            loading={loading && connectingId === 'gmail'}
                            disabled={connectorActionsBusy}
                            onConnect={(req) => handleConnect('gmail', req)}
                          />
                        )}
                        {meta?.troubleshooting && (
                          <details className="mt-4 text-[13px] leading-5">
                            <summary className="cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                              Having trouble?
                            </summary>
                            <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-5" style={{ color: 'var(--color-text-secondary)' }}>
                              {meta.troubleshooting.map((tip: string, ti: number) => (
                                <li key={ti}>{tip}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    )}

                    {c.connector_id !== 'upload' && !meta?.steps && (
                      <GenericConnectPanel
                        connectorId={c.connector_id}
                        displayName={meta?.display_name ?? c.display_name}
                        authType={c.auth_type || 'oauth'}
                        loading={loading && connectingId === c.connector_id}
                        disabled={connectorActionsBusy}
                        onConnect={(req) => handleConnect(c.connector_id, req)}
                        onOAuthStart={() => handleConnect(c.connector_id, null)}
                      />
                    )}

                    {/* Connection progress */}
                    {c.connector_id !== 'upload' && isConnecting && (
                      <div className="mt-4" role="status">
                        <div className="text-[13px] leading-5 mb-1.5" style={{ color: 'var(--color-text)' }}>
                          {connectStage}
                        </div>
                        {meta?.steps && (
                          <LineFill
                            color="var(--line-data)"
                            fraction={connectStage.includes('Sync') ? 0.75 : connectStage.includes('Connected') ? 0.5 : 0.25}
                          />
                        )}
                      </div>
                    )}
                    {/* Connection error */}
                    {c.connector_id !== 'upload' && showError && (
                      <FailRow className="mt-4">{connectError}</FailRow>
                    )}
                  </motion.div>
                )}
                </div>
              </LineStop>
            );
          })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messaging channels section
// ---------------------------------------------------------------------------

interface ChannelField {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  required?: boolean;
}

interface MessagingChannelConfig {
  type: string;
  name: string;
  icon: string;
  description: string;
  setupSteps: string[];
  fields: ChannelField[];
  activeLabel: (cfg: Record<string, unknown>) => string;
  howToUse: (cfg: Record<string, unknown>) => string;
}

const MESSAGING_CHANNELS: MessagingChannelConfig[] = [
  {
    type: 'slack',
    name: 'Slack',
    icon: '#',
    description: 'DM your agent in any Slack workspace',
    setupSteps: [
      '1. Go to api.slack.com/apps \u2192 click "Create New App" \u2192 choose "From an app manifest"',
      '2. Select your workspace. When asked for the manifest format, choose JSON. Then paste the manifest below (click "Copy" to copy it):',
      'COPYABLE:{"display_information":{"name":"OpenJarvis"},"features":{"app_home":{"home_tab_enabled":true,"messages_tab_enabled":true,"messages_tab_read_only_enabled":false},"bot_user":{"display_name":"OpenJarvis","always_online":true}},"oauth_config":{"scopes":{"bot":["chat:write","im:write","im:read","im:history","mpim:read","mpim:history","users:read","channels:read","channels:history","channels:join","groups:read","groups:history","app_mentions:read"]}},"settings":{"event_subscriptions":{"bot_events":["message.im"]},"socket_mode_enabled":true}}',
      '3. Click "Next" \u2192 review the summary \u2192 click "Create". Then go to "Install App" in the left sidebar \u2192 click "Install to Workspace" \u2192 click "Allow"',
      '4. In the left sidebar, click "OAuth & Permissions". Copy the "Bot User OAuth Token" (starts with xoxb-...)',
      '5. In the left sidebar, click "Basic Information" \u2192 scroll to "App-Level Tokens" \u2192 click "Generate Token and Scopes" \u2192 name it "socket" \u2192 click "Add Scope" \u2192 select "connections:write" \u2192 click "Generate" \u2192 copy the token (starts with xapp-...)',
      '6. (Optional) Still in "Basic Information", scroll to "Display Information" \u2192 upload the OpenJarvis icon as the app icon',
      '7. Paste both tokens below and click Connect',
    ],
    fields: [
      { key: 'bot_token', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', required: true },
      { key: 'app_token', label: 'App Token', placeholder: 'xapp-...', type: 'password', required: true },
    ],
    activeLabel: () => 'Connected to Slack',
    howToUse: () => 'Open Slack and DM @OpenJarvis to talk to your agent.',
  },
];

// SendBlue wizard — simplified for standalone page
function SendBlueSection({
  agentId,
  binding,
  onDone,
  onRemove,
}: {
  agentId: string;
  binding?: ChannelBinding;
  onDone: () => void;
  onRemove: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [phone, setPhone] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    if (binding) {
      sendblueHealth().then(setHealth).catch(() => {});
    }
  }, [agentId, binding]);

  const registerWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setWebhookStatus('registering');
    try {
      const url = webhookUrl.trim().replace(/\/+$/, '') + '/v1/channels/sendblue/webhook';
      await sendblueRegisterWebhook(apiKey.trim(), apiSecret.trim(), url);
      setWebhookStatus('done');
    } catch {
      setWebhookStatus('error');
    }
  };

  if (binding) {
    const cfg = (binding.config || {}) as Record<string, unknown>;
    return (
      <li className="py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-start gap-4">
          <LineBullet letter="M" size={24} className="mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] leading-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>iMessage + SMS</div>
            <div className="text-[13px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
              Active &mdash; text <span className="tn-mono" style={{ color: 'var(--color-text)' }}>{(cfg.phone_number as string) || 'your number'}</span> to chat
            </div>
            {health && (
              <div className="tn-mono text-[12px] leading-4 mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
                Webhook: {health.webhook_registered ? 'registered' : 'not registered'}
                {health.phone_number && ` \u2022 ${health.phone_number}`}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(binding.id)}
            className="tn-btn tn-btn-sm shrink-0"
          >Remove</button>
        </div>
      </li>
    );
  }

  const codeStyle = { background: 'var(--color-code-bg)', padding: '1px 4px', borderRadius: 2, color: 'var(--color-text)' } as const;

  // Not active — setup wizard
  const steps = [
    {
      title: 'Get SendBlue API keys',
      content: (
        <div className="flex flex-col gap-2 text-[13px] leading-5">
          <div style={{ color: 'var(--color-text)' }}>
            SendBlue lets your agent send and receive iMessages and SMS. You need an account and API credentials.
          </div>
          <div className="flex flex-col gap-1">
            <a href="https://sendblue.co" target="_blank" rel="noopener noreferrer" className="self-start" style={linkStyle}>
              1. Sign up at sendblue.co &rarr;
            </a>
            <a href="https://dashboard.sendblue.co/api-credentials" target="_blank" rel="noopener noreferrer" className="self-start" style={linkStyle}>
              2. Go to your API Credentials page &rarr;
            </a>
          </div>
          <div style={{ color: 'var(--color-text-secondary)' }}>
            Copy the "API Key" and "API Secret" from the credentials page and paste them below.
          </div>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key" aria-label="API Key" className="tn-input" />
          <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
            placeholder="API Secret" aria-label="API Secret" type="password" className="tn-input" />
        </div>
      ),
      canAdvance: apiKey.trim() && apiSecret.trim(),
    },
    {
      title: 'Enter your phone number',
      content: (
        <div className="flex flex-col gap-2 text-[13px] leading-5">
          <div style={{ color: 'var(--color-text)' }}>
            Which phone number should SendBlue use? This is the number people will text to reach your agent.
          </div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+1XXXXXXXXXX" aria-label="Phone number" className="tn-input tn-mono" />
        </div>
      ),
      canAdvance: phone.trim().length >= 10,
    },
    {
      title: 'Set up webhook (ngrok tunnel)',
      content: (
        <div className="flex flex-col gap-3 text-[13px] leading-5">
          <div style={{ color: 'var(--color-text)' }}>
            SendBlue needs a public URL to send incoming messages to your local server. Use ngrok to create a tunnel.
          </div>
          <StepList>
            {[
              <span key="a">Open a terminal and run: <code className="tn-mono text-[12px]" style={codeStyle}>ngrok http 8000</code></span>,
              <span key="b">Copy the <code className="tn-mono text-[12px]" style={codeStyle}>https://</code> forwarding URL (e.g. https://abc123.ngrok.io)</span>,
              <span key="c">Paste it below and click "Register Webhook"</span>,
            ]}
          </StepList>
          <div className="flex flex-wrap gap-2">
            <input
              value={webhookUrl}
              onChange={(e) => { setWebhookUrl(e.target.value); setWebhookStatus('idle'); }}
              placeholder="https://abc123.ngrok-free.app"
              aria-label="Public tunnel URL"
              className="tn-input tn-mono flex-1"
              style={{ minWidth: 200, width: 'auto' }}
            />
            <button
              type="button"
              onClick={registerWebhook}
              disabled={!webhookUrl.trim() || webhookStatus === 'registering'}
              className={`tn-btn ${webhookStatus === 'done' ? '' : 'tn-btn-primary'}`}
            >
              {webhookStatus === 'registering' ? 'Registering...'
                : webhookStatus === 'done' ? 'Registered!'
                : webhookStatus === 'error' ? 'Retry'
                : 'Register Webhook'}
            </button>
          </div>
          {webhookStatus === 'done' && (
            <div role="status" style={{ color: 'var(--color-text)' }}>
              Webhook registered! Incoming texts will be forwarded to your agent.
            </div>
          )}
          {webhookStatus === 'error' && (
            <FailRow>
              Failed to register webhook. Check your ngrok URL and SendBlue credentials.
            </FailRow>
          )}
          <div className="text-[12px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>
            Don't have ngrok? <a href="https://ngrok.com/download" target="_blank" rel="noopener noreferrer" style={linkStyle}>Download it free</a>. You can also skip this step and register the webhook later.
          </div>
        </div>
      ),
      canAdvance: true, // webhook is optional — user can skip
    },
  ];

  const handleFinish = async () => {
    setLoading(true);
    setError('');
    try {
      await bindAgentChannel(agentId, 'sendblue', {
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        phone_number: phone.trim(),
      });
      // If webhook was registered in the wizard, that's already done.
      // If not, try a best-effort registration with the provided URL.
      if (webhookUrl.trim() && webhookStatus !== 'done') {
        try {
          const url = webhookUrl.trim().replace(/\/+$/, '') + '/v1/channels/sendblue/webhook';
          await sendblueRegisterWebhook(apiKey.trim(), apiSecret.trim(), url);
        } catch { /* */ }
      }
      onDone();
      setStep(0);
      setApiKey('');
      setApiSecret('');
      setPhone('');
      setWebhookUrl('');
      setWebhookStatus('idle');
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <li style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div
        className="flex items-start gap-4 py-4 cursor-pointer"
        onClick={() => setStep(step === 0 && !apiKey ? -1 : 0)}
      >
        <LineBullet letter="M" size={24} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] leading-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>iMessage + SMS (SendBlue)</div>
          <div className="text-[13px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
            Let people text your agent from any phone
          </div>
        </div>
        <button
          type="button"
          aria-expanded={step >= 0}
          onClick={(e) => { e.stopPropagation(); setStep(step === 0 && !apiKey ? -1 : 0); }}
          className="tn-btn tn-btn-sm shrink-0"
        >
          {step >= 0 ? 'Set Up' : 'Add'}
        </button>
      </div>

      {step >= 0 && (
        <div className="tn-panel mb-4 p-4 md:p-5" style={{ ['--station-fill' as string]: 'var(--color-surface)', maxWidth: 640 }}>
          <StepStations titles={steps.map((s) => s.title)} current={step} />

          <h4 className="text-[15px] leading-[22px] font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {steps[step]?.title}
          </h4>
          {steps[step]?.content}

          {error && <FailRow className="mt-3">{error}</FailRow>}

          <div className="flex gap-2 mt-5">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="tn-btn">Back</button>
            )}
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!steps[step]?.canAdvance}
                className="tn-btn tn-btn-primary"
              >Next</button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={loading || !steps[step]?.canAdvance}
                className="tn-btn tn-btn-primary"
              >{loading ? 'Connecting...' : 'Connect'}</button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Wizard progress as stations on one line: done = filled, here = action blue, ahead = open. */
function StepStations({ titles, current }: { titles: string[]; current: number }) {
  return (
    <ol className="flex items-start mb-5" aria-label="Setup steps">
      {titles.map((title, i) => {
        const done = i < current;
        const here = i === current;
        const stroke = here ? 'var(--action)' : done ? 'var(--color-text)' : 'var(--line-none)';
        return (
          <li key={title} className="flex-1 min-w-0 flex flex-col gap-1.5" aria-current={here ? 'step' : undefined}>
            <div className="flex items-center" style={{ height: 14 }}>
              <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 relative z-[1]">
                <circle
                  cx={7} cy={7} r={5.5} strokeWidth={3}
                  style={{ stroke, fill: done || here ? stroke : 'var(--station-fill, var(--color-bg))' }}
                />
              </svg>
              {i < titles.length - 1 && (
                <span aria-hidden="true" className="flex-1" style={{ height: 5, marginLeft: -2, background: done ? 'var(--color-text)' : 'var(--color-border)' }} />
              )}
            </div>
            <span
              className="text-[12px] leading-4 pr-3"
              style={{ color: here ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: here ? 600 : 400 }}
            >
              <span className="sr-only">{done ? 'Done: ' : here ? 'Current: ' : 'Next: '}</span>
              {title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MessagingSection({ agentId }: { agentId: string }) {
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [setupType, setSetupType] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadBindings = useCallback(() => {
    fetchAgentChannels(agentId).then(setBindings).catch(() => setBindings([]));
  }, [agentId]);

  useEffect(() => { loadBindings(); }, [loadBindings]);

  const setField = (key: string, value: string) =>
    setFormValues((prev) => ({ ...prev, [key]: value }));

  const handleSetup = async (ch: MessagingChannelConfig) => {
    const missing = ch.fields.filter((f) => f.required && !formValues[f.key]?.trim());
    if (missing.length > 0) return;
    setLoading(true);
    try {
      const config: Record<string, string> = {};
      for (const f of ch.fields) {
        const v = formValues[f.key]?.trim();
        if (v) config[f.key] = v;
      }
      await bindAgentChannel(agentId, ch.type, config);
      setSetupType(null);
      setFormValues({});
      loadBindings();
    } catch { /* */ } finally { setLoading(false); }
  };

  const handleRemove = async (bindingId: string) => {
    try {
      await unbindAgentChannel(agentId, bindingId);
      loadBindings();
    } catch { /* */ }
  };

  return (
    <section aria-labelledby="ds-channels">
      <SectionHeading id="ds-channels">Channels</SectionHeading>
      <ul>
      {/* SendBlue */}
      <SendBlueSection
        agentId={agentId}
        binding={bindings.find((b) => b.channel_type === 'sendblue')}
        onDone={loadBindings}
        onRemove={(id) => { unbindAgentChannel(agentId, id).then(loadBindings).catch(() => {}); }}
      />

      {/* Other messaging channels */}
      {MESSAGING_CHANNELS.map((ch) => {
        const binding = bindings.find((b) => b.channel_type === ch.type);
        const cfg = (binding?.config || {}) as Record<string, unknown>;
        const isSetup = setupType === ch.type;
        const canConnect = ch.fields.every((f) => !f.required || formValues[f.key]?.trim());

        return (
          <li key={ch.type} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-start gap-4 py-4">
              <LineBullet letter={ch.name.charAt(0)} size={24} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] leading-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>{ch.name}</div>
                <div className="text-[13px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                  {binding ? ch.activeLabel(cfg) : ch.description}
                </div>
                {binding && (
                  <div className="text-[13px] leading-5 mt-1" style={{ color: 'var(--color-text)' }}>
                    {ch.howToUse(cfg)}
                  </div>
                )}
              </div>
              {binding ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="tn-chip">Active</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(binding.id)}
                    className="tn-btn tn-btn-sm"
                  >Remove</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setSetupType(isSetup ? null : ch.type); setFormValues({}); }}
                  aria-expanded={isSetup}
                  className={`tn-btn tn-btn-sm shrink-0 ${isSetup ? 'tn-btn-ghost' : ''}`}
                >{isSetup ? 'Cancel' : 'Set Up'}</button>
              )}
            </div>

            {isSetup && (
              <div className="tn-panel mb-4 p-4 md:p-5" style={{ maxWidth: 640 }}>
                <ol className="flex flex-col mb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                  {ch.setupSteps.map((s, i) => {
                    if (s.startsWith('COPYABLE:')) {
                      const text = s.slice(9);
                      return (
                        <li key={i} className="py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <div className="flex items-center justify-end mb-1.5">
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(text); }}
                              className="tn-btn tn-btn-sm"
                            >Copy</button>
                          </div>
                          <pre
                            className="tn-mono text-[11px] leading-4 p-2.5 overflow-y-auto"
                            style={{
                              background: 'var(--color-code-bg)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 2,
                              color: 'var(--color-text)',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              maxHeight: 96,
                            }}
                          >{text}</pre>
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="py-2.5 text-[13px] leading-5" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}>{s}</li>
                    );
                  })}
                </ol>
                <div className="flex flex-col gap-3">
                  {ch.fields.map((field) => (
                    <label key={field.key} className="flex flex-col gap-1 text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      <span>{field.label}{field.required ? ' *' : ''}</span>
                      <input
                        type={field.type || 'text'}
                        value={formValues[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="tn-input tn-mono"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleSetup(ch)}
                  disabled={loading || !canConnect}
                  className="tn-btn tn-btn-primary mt-4"
                >{loading ? 'Connecting...' : 'Connect'}</button>
              </div>
            )}
          </li>
        );
      })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Memory section
// ---------------------------------------------------------------------------

function MemorySection() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [statsError, setStatsError] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // Index
  const [indexPath, setIndexPath] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState('');
  const [indexError, setIndexError] = useState('');

  // Store
  const [storeContent, setStoreContent] = useState('');
  const [storing, setStoring] = useState(false);
  const [storeResult, setStoreResult] = useState('');
  const [storeError, setStoreError] = useState('');

  const statsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(() => {
    getMemoryStats()
      .then((s) => { setStats(s); setStatsError(''); })
      .catch((error: unknown) => {
        setStats(null);
        setStatsError(error instanceof Error && error.message ? error.message : 'Could not reach memory backend');
      });
  }, []);

  useEffect(() => {
    loadStats();
    statsInterval.current = setInterval(loadStats, 10000);
    return () => { if (statsInterval.current) clearInterval(statsInterval.current); };
  }, [loadStats]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchDone(false);
    try {
      const results = await searchMemory(searchQuery.trim());
      setSearchResults(results || []);
      setSearchDone(true);
    } catch {
      setSearchResults([]);
      setSearchDone(true);
    } finally {
      setSearching(false);
    }
  };

  const handleBrowse = async () => {
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true, multiple: false, title: 'Select folder to index' });
        if (selected) setIndexPath(selected as string);
        return;
      } catch {
        // fall through to browser picker
      }
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.onchange = () => {
      const files = input.files;
      if (files && files.length > 0) {
        const rel = (files[0] as any).webkitRelativePath || '';
        const folder = rel.split('/')[0];
        if (folder) setIndexPath(folder);
      }
    };
    input.click();
  };

  const handleIndex = async () => {
    if (!indexPath.trim()) return;
    setIndexing(true);
    setIndexResult('');
    setIndexError('');
    try {
      const res = await indexMemoryPath(indexPath.trim());
      setIndexResult(`Indexed ${res.chunks_indexed} chunk${res.chunks_indexed !== 1 ? 's' : ''}`);
      setIndexPath('');
      loadStats();
    } catch (err: any) {
      setIndexError(err.message || 'Indexing failed');
    } finally {
      setIndexing(false);
    }
  };

  const handleStore = async () => {
    if (!storeContent.trim()) return;
    setStoring(true);
    setStoreResult('');
    setStoreError('');
    try {
      await storeMemory(storeContent.trim());
      setStoreResult('Stored successfully');
      setStoreContent('');
      loadStats();
    } catch (err: any) {
      setStoreError(err.message || 'Failed to store');
    } finally {
      setStoring(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Backend status */}
      <section aria-labelledby="mem-backend">
        <SectionHeading id="mem-backend">Memory Backend</SectionHeading>
        <div className="mt-3 min-w-0">
          {statsError ? (
            <div className="tn-rule-fail pt-2 flex flex-col items-start gap-2">
              <p role="alert" className="text-[13px] leading-5 break-words" style={{ color: 'var(--fail)', fontWeight: 500 }}>{statsError}</p>
              <button
                type="button"
                onClick={loadStats}
                aria-label="Retry memory backend status"
                className="tn-btn tn-btn-sm"
              >
                Retry
              </button>
            </div>
          ) : stats ? (
            <div className="flex items-center gap-3">
              <Station line="data" state={stats.entries > 0 ? 'current' : 'open'} />
              <span className="tn-mono text-[15px] leading-[22px]" style={{ color: 'var(--color-text)' }}>
                {stats.backend} &middot; {stats.entries.toLocaleString()} {stats.entries === 1 ? 'chunk' : 'chunks'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Station line="none" state="unavailable" />
              <p className="text-[13px] leading-5" style={{ color: 'var(--color-text-tertiary)' }}>Connecting...</p>
            </div>
          )}
        </div>
      </section>

      {/* Search */}
      <section aria-labelledby="mem-search">
        <SectionHeading id="mem-search">Search Memory</SectionHeading>
        <div className="flex gap-2 mt-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="What are you looking for?"
            aria-label="Search memory"
            className="tn-input flex-1"
            style={{ width: 'auto', minWidth: 0 }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="tn-btn tn-btn-primary shrink-0"
          >
            {searching ? 'Searching' : 'Search'}
          </button>
        </div>

        {/* Results */}
        {searchDone && searchResults.length === 0 && (
          <p className="text-[13px] leading-5 mt-4" style={{ color: 'var(--color-text-tertiary)' }}>No matching memories found</p>
        )}
        {searchResults.length > 0 && (
          <ul className="mt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            {searchResults.map((r, i) => (
              <li key={i} className="py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <p className="text-[14px] leading-[22px]" style={{ color: 'var(--color-text)', maxWidth: '75ch', overflowWrap: 'anywhere' }}>
                  {r.content.length > 250 ? r.content.slice(0, 250) + '...' : r.content}
                </p>
                <div className="tn-mono flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[12px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span style={{ color: r.score > 0.5 ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                    {(r.score * 100).toFixed(0)}% match
                  </span>
                  {r.metadata?.source != null && (
                    <span className="min-w-0 truncate">
                      {String(r.metadata.source)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add to Memory: two columns, one below 768px */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Index folder */}
        <section className="tn-panel p-5 flex flex-col" aria-labelledby="mem-index">
          <h3 id="mem-index" className="text-[15px] leading-[22px] font-bold" style={{ color: 'var(--color-text)' }}>Index Folder</h3>
          <p className="text-[13px] leading-5 mt-1 mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Scan a folder and index all supported files into memory.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              value={indexPath}
              onChange={(e) => setIndexPath(e.target.value)}
              placeholder="~/Documents/notes"
              aria-label="Folder path"
              className="tn-input tn-mono flex-1"
              style={{ width: 'auto', minWidth: 0 }}
            />
            {isTauri() && (
              <button
                type="button"
                onClick={handleBrowse}
                className="tn-btn shrink-0"
              >
                <FolderOpen size={16} aria-hidden="true" />
                Browse
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleIndex}
            disabled={indexing || !indexPath.trim()}
            className="tn-btn tn-btn-primary self-start"
          >
            {indexing ? 'Indexing files...' : 'Index'}
          </button>
          {indexResult && (
            <p role="status" className="tn-mono text-[13px] mt-3" style={{ color: 'var(--color-text)' }}>{indexResult}</p>
          )}
          {indexError && <FailRow className="mt-3">{indexError}</FailRow>}
        </section>

        {/* Paste content */}
        <section className="tn-panel p-5 flex flex-col" aria-labelledby="mem-store">
          <h3 id="mem-store" className="text-[15px] leading-[22px] font-bold" style={{ color: 'var(--color-text)' }}>Store Text</h3>
          <p className="text-[13px] leading-5 mt-1 mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Paste any text to add directly to your memory store.
          </p>
          <textarea
            value={storeContent}
            onChange={(e) => setStoreContent(e.target.value)}
            placeholder="Paste or type content here..."
            aria-label="Text to store"
            rows={4}
            className="tn-textarea mb-3"
            style={{ minHeight: 96 }}
          />
          <button
            type="button"
            onClick={handleStore}
            disabled={storing || !storeContent.trim()}
            className="tn-btn tn-btn-primary self-start"
          >
            {storing ? 'Storing...' : 'Store'}
          </button>
          {storeResult && (
            <p role="status" className="text-[13px] mt-3" style={{ color: 'var(--color-text)' }}>{storeResult}</p>
          )}
          {storeError && <FailRow className="mt-3">{storeError}</FailRow>}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DataSourcesPage() {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [activeTab, setActiveTab] = useState<'sources' | 'messaging' | 'memory'>('sources');
  const [creatingAgent, setCreatingAgent] = useState(false);

  const loadAgents = useCallback(() => {
    fetchManagedAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  // Pick the first agent for messaging channel bindings.
  // If none exists and user opens Messaging tab, auto-create a default one.
  const firstAgent = agents[0];

  const ensureAgent = useCallback(async (): Promise<string | null> => {
    if (firstAgent) return firstAgent.id;
    setCreatingAgent(true);
    try {
      const agent = await createManagedAgent({
        name: "My Assistant",
        template_id: "personal_deep_research",
      });
      setAgents((prev) => [...prev, agent]);
      return agent.id;
    } catch {
      return null;
    } finally {
      setCreatingAgent(false);
    }
  }, [firstAgent]);

  // Auto-create agent when switching to messaging tab
  useEffect(() => {
    if (activeTab === 'messaging' && !firstAgent && !creatingAgent) {
      ensureAgent();
    }
  }, [activeTab, firstAgent, creatingAgent, ensureAgent]);

  const tabs = [
    { id: 'sources' as const, label: 'Data Sources' },
    { id: 'messaging' as const, label: 'Messaging Channels' },
    { id: 'memory' as const, label: 'Memory' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
      <div className="max-w-[880px] mx-auto">
      <header className="mb-5">
        <h1 className="tn-page-title">Data Sources, Channels &amp; Memory</h1>
        <p className="text-[14px] leading-[22px] mt-2" style={{ color: 'var(--color-text-secondary)', maxWidth: '68ch' }}>
          Connect personal data so the assistant can search across everything, and set up messaging channels to chat from your phone.
        </p>
      </header>

      <div className="tn-tabs mb-8 overflow-x-auto" role="tablist" aria-label="Data Sources sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`ds-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`ds-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className="tn-tab shrink-0 whitespace-nowrap"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`ds-panel-${activeTab}`} aria-labelledby={`ds-tab-${activeTab}`}>
        {activeTab === 'sources' && <DataSourcesSection />}
        {activeTab === 'messaging' && (
          firstAgent ? (
            <MessagingSection agentId={firstAgent.id} />
          ) : creatingAgent ? (
            <div role="status" className="flex items-center gap-3 py-4 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
              <Station line="none" state="current" />
              Setting up your assistant...
            </div>
          ) : null
        )}
        {activeTab === 'memory' && <MemorySection />}
      </div>
      </div>
    </div>
  );
}
