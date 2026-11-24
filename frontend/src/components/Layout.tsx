import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { ApprovalBell } from './ApprovalBell';
import { Sidebar } from './Sidebar/Sidebar';
import { SystemPulse } from './SystemPulse';
import { useAppStore } from '../lib/store';
import { checkHealth } from '../lib/api';

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

  // Compute last assistant latency from current conversation if available
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.telemetry);
  const latencyMs = lastAssistant?.telemetry?.total_ms;
  const latencyLabel = latencyMs != null
    ? latencyMs >= 1000
      ? `${(latencyMs / 1000).toFixed(1)}s`
      : `${Math.round(latencyMs)}ms`
    : '--';

  const activeModel = selectedModel || serverInfo?.model || 'unassigned';
  const engineLabel = (serverInfo?.engine || 'multi').toUpperCase();
  const isCloud = activeModel.includes('/') && !activeModel.startsWith('local/');
  const routeMode = isCloud ? 'CLOUD' : 'LOCAL';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative" style={{ background: 'var(--color-bg)' }}>
      <SystemPulse apiReachable={apiReachable} />

      {/* Health check banner */}
      {apiReachable === false && (
        <div
          className="flex items-center gap-3 px-4 py-2 text-xs shrink-0"
          style={{
            background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-bg-secondary))',
            borderBottom: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
            color: 'var(--color-text)',
          }}
        >
          <span
            className="hw-led"
            style={{ background: 'var(--color-error)' }}
          />
          <span className="font-medium">Cannot reach OpenJarvis backend</span>
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
          {/* Hardware Telemetry Strip */}
          <header
            className="h-10 shrink-0 flex items-center justify-between px-4 select-none"
            style={{
              background: 'var(--color-bg-secondary)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div className={`flex items-center gap-4 text-[11px] hw-mono ${!sidebarOpen ? 'pl-9' : ''}`}>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--color-text-tertiary)' }}>ENGINE:</span>
                <span className="font-medium" style={{ color: 'var(--color-text)' }}>{engineLabel}</span>
              </div>
              <span className="hidden sm:inline" style={{ color: 'var(--color-border)' }}>|</span>
              <div className="hidden sm:flex items-center gap-2">
                <span style={{ color: 'var(--color-text-tertiary)' }}>LATENCY:</span>
                <span className="font-medium" style={{ color: 'var(--color-text)' }}>{latencyLabel}</span>
              </div>
              <span className="hidden md:inline" style={{ color: 'var(--color-border)' }}>|</span>
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="hidden md:flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                title="Switch active model (⌘K)"
              >
                <span style={{ color: 'var(--color-text-tertiary)' }}>MODEL:</span>
                <span className="font-medium truncate max-w-[220px]" style={{ color: 'var(--color-text)' }}>
                  {activeModel}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[11px] hw-mono">
                <span className="hidden sm:inline" style={{ color: 'var(--color-text-tertiary)' }}>MODE:</span>
                <span className="hidden sm:inline font-medium" style={{ color: 'var(--color-text)' }}>{routeMode}</span>
                <span
                  className="hw-led"
                  style={{
                    background: isStreaming
                      ? 'var(--color-accent)'
                      : apiReachable === false
                      ? 'var(--color-error)'
                      : 'var(--color-success)',
                  }}
                  title={isStreaming ? 'Inferencing' : apiReachable === false ? 'Disconnected' : 'Online'}
                />
              </div>
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
