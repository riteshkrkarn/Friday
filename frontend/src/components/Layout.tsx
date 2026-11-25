import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Mic, Sparkles } from 'lucide-react';
import { ApprovalBell } from './ApprovalBell';
import { Sidebar } from './Sidebar/Sidebar';
import { SystemPulse } from './SystemPulse';
import { useAppStore } from '../lib/store';
import { checkHealth } from '../lib/api';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Chat',
  '/today': 'Today',
  '/dashboard': 'Overview',
  '/data-sources': 'Data Sources',
  '/agents': 'Agents',
  '/logs': 'Logs',
  '/settings': 'Settings',
  '/get-started': 'Get Started',
};

export function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const messages = useAppStore((s) => s.messages);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => checkHealth().then(setApiReachable);
    check();
    const interval = setInterval(check, 30000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const viewTitle = PAGE_TITLES[location.pathname] || 'Workspace';

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.telemetry);
  const latencyMs = lastAssistant?.telemetry?.total_ms;
  const latencyLabel = latencyMs != null
    ? latencyMs >= 1000
      ? `${(latencyMs / 1000).toFixed(1)}s`
      : `${Math.round(latencyMs)}ms`
    : null;

  const activeModel = selectedModel || serverInfo?.model || 'Select model';
  const isCloud = activeModel.includes('/') && !activeModel.startsWith('local/');

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative" style={{ background: 'var(--color-bg)' }}>
      <SystemPulse apiReachable={apiReachable} />

      {/* Health check banner */}
      {apiReachable === false && (
        <div
          className="flex items-center gap-3 px-4 py-2 text-xs shrink-0 z-20"
          style={{
            background: 'color-mix(in srgb, var(--color-error) 12%, var(--color-bg-secondary))',
            borderBottom: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
            color: 'var(--color-text)',
          }}
        >
          <span className="studio-dot" style={{ background: 'var(--color-error)' }} />
          <span className="font-medium">Friday backend is offline</span>
          <button
            onClick={() => navigate('/settings')}
            className="text-xs font-medium underline cursor-pointer ml-auto shrink-0"
            style={{ color: 'var(--color-accent)' }}
          >
            Configure endpoint
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative z-10">
        <Sidebar />
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => useAppStore.getState().setSidebarOpen(false)}
          />
        )}
        <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          {/* Liquid Glass Studio Toolbar */}
          <header
            className="h-12 shrink-0 flex items-center justify-between px-4 select-none studio-glass border-b z-10"
          >
            <div className={`flex items-center gap-3 ${!sidebarOpen ? 'pl-10' : ''}`}>
              <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                {viewTitle}
              </h2>
              {isStreaming && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: 'var(--color-accent-subtle)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <Sparkles size={12} />
                  Thinking
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {/* Quick Capture Shortcut Hint */}
              <button
                onClick={() => navigate('/today')}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer transition-colors"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
                title="Open Today & Quick Capture"
              >
                <Mic size={12} style={{ color: 'var(--color-accent)' }} />
                <span>Quick Capture</span>
                <kbd className="studio-mono text-[11px] opacity-80">RCtrl ×2</kbd>
              </button>

              {/* Model Selector Pill */}
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 px-3 py-1 rounded-full text-xs cursor-pointer transition-colors"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                title={
                  latencyLabel
                    ? `Switch model (⌘K) · ${isCloud ? 'Cloud' : 'Local'} · Last reply ${latencyLabel}`
                    : `Switch model (⌘K) · ${isCloud ? 'Cloud' : 'Local'}`
                }
              >
                <span
                  className="studio-dot"
                  style={{
                    background: isStreaming
                      ? 'var(--color-accent)'
                      : apiReachable === false
                      ? 'var(--color-error)'
                      : 'var(--color-success)',
                  }}
                />
                <span className="font-medium truncate max-w-[160px] sm:max-w-[220px]">
                  {activeModel}
                </span>
                <kbd
                  className="hidden sm:inline studio-mono text-[11px] px-1 rounded"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  ⌘K
                </kbd>
              </button>

              <ApprovalBell inline />
            </div>
          </header>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
