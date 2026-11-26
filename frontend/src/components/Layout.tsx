import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Mic, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { ApprovalBell } from './ApprovalBell';
import { Sidebar } from './Sidebar/Sidebar';
import { SystemPulse } from './SystemPulse';
import { Kbd, Station } from './transit';
import { useAppStore } from '../lib/store';
import { checkHealth } from '../lib/api';
import { LINE_NAMES, lineForModel } from '../lib/transit-lines';

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
  const models = useAppStore((s) => s.models);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const deepResearch = useAppStore((s) => s.deepResearch);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const messages = useAppStore((s) => s.messages);
  const conversations = useAppStore((s) => s.conversations);
  const activeId = useAppStore((s) => s.activeId);
  const systemPanelOpen = useAppStore((s) => s.systemPanelOpen);
  const toggleSystemPanel = useAppStore((s) => s.toggleSystemPanel);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const apiReachable = useAppStore((s) => s.apiReachable);
  const setApiReachable = useAppStore((s) => s.setApiReachable);

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
  }, [setApiReachable]);

  const navigate = useNavigate();
  const location = useLocation();
  const isChat = location.pathname === '/';
  const activeConversationTitle = isChat
    ? conversations.find((c) => c.id === activeId)?.title
    : undefined;
  const viewTitle = activeConversationTitle || PAGE_TITLES[location.pathname] || 'Workspace';

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.telemetry);
  const latencyMs = lastAssistant?.telemetry?.total_ms;
  const latencyLabel = latencyMs != null
    ? latencyMs >= 1000
      ? `${(latencyMs / 1000).toFixed(1)}s`
      : `${Math.round(latencyMs)}ms`
    : null;

  const activeModel = selectedModel || serverInfo?.model || 'Select model';
  const isCloud = activeModel.includes('/') && !activeModel.startsWith('local/');

  const hasModel = !!(selectedModel || serverInfo?.model);
  const modelId = selectedModel || serverInfo?.model || '';
  const owner = models.find((m) => m.id === modelId)?.owned_by;
  const modelLine = lineForModel(modelId, owner);
  const lastEngineForModel = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.telemetry?.engine && m.telemetry.model_id === modelId)
    ?.telemetry?.engine;
  const engineLabel = deepResearch
    ? 'Deep Research'
    : modelLoading
      ? 'loading'
      : lastEngineForModel || LINE_NAMES[modelLine];
  const pillState = apiReachable === false
    ? 'failed'
    : !hasModel || modelLoading
      ? 'unavailable'
      : isStreaming
        ? 'current'
        : 'open';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative" style={{ background: 'var(--color-bg)' }}>
      <SystemPulse apiReachable={apiReachable} />

      {/* Health check banner */}
      {apiReachable === false && (
        <div
          role="status"
          className="flex items-center gap-3 px-5 md:px-8 py-2 text-[14px] shrink-0 z-20"
          style={{
            background: 'var(--color-surface)',
            borderTop: 'var(--rule-bar) solid var(--fail)',
            borderBottom: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <Station line="none" state="failed" size={12} />
          <span className="font-semibold">Friday backend is offline</span>
          <button
            onClick={() => navigate('/settings')}
            className="text-[14px] font-medium underline underline-offset-[3px] cursor-pointer ml-auto shrink-0 rounded-[2px]"
            style={{ color: 'var(--action)' }}
          >
            Configure endpoint
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative z-10">
        <Sidebar />
        {sidebarOpen && (
          <div
            className="tn-scrim z-20 md:hidden"
            onClick={() => useAppStore.getState().setSidebarOpen(false)}
          />
        )}
        <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          <header
            className={`h-16 shrink-0 flex items-center gap-4 pr-3 md:pr-5 select-none z-10 ${!sidebarOpen ? 'pl-14' : 'pl-5 md:pl-8'}`}
            style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
          >
            <div className="flex items-center gap-4 min-w-0">
              <h2 className="text-[20px] leading-7 font-bold truncate" style={{ color: 'var(--color-text)' }}>
                {viewTitle}
              </h2>

              {/* Model pill: line station, model id, engine */}
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 h-9 px-3 rounded-[2px] cursor-pointer min-w-0 shrink transition-colors duration-150 ease-out hover:bg-[var(--color-bg-tertiary)]"
                style={{ border: '2px solid var(--color-text)', color: 'var(--color-text)' }}
                title={
                  latencyLabel
                    ? `Switch model (⌘K) · ${isCloud ? 'Cloud' : 'Local'} · Last reply ${latencyLabel}`
                    : `Switch model (⌘K) · ${isCloud ? 'Cloud' : 'Local'}`
                }
              >
                <Station line={modelLine} state={pillState} size={12} />
                <span className={`${hasModel ? 'tn-mono' : 'font-medium'} text-[13px] truncate max-w-[120px] sm:max-w-[240px]`}>
                  {activeModel}
                </span>
                {engineLabel && (
                  <span className="hidden sm:inline text-[13px] whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                    · {engineLabel}
                  </span>
                )}
                <Kbd className="hidden md:inline-flex ml-1">⌘K</Kbd>
              </button>

              {isStreaming && (
                <span className="hidden sm:inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                  <Station line={modelLine} state="current" size={10} />
                  Thinking
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {serverInfo?.agent && (
                <span
                  className="hidden lg:inline tn-mono text-[13px] mr-2 truncate max-w-[160px]"
                  style={{ color: 'var(--color-text-secondary)' }}
                  title="Agent"
                >
                  {serverInfo.agent}
                </span>
              )}

              {/* Quick Capture Shortcut Hint */}
              <button
                onClick={() => navigate('/today')}
                className="tn-btn tn-btn-ghost tn-btn-sm hidden lg:inline-flex"
                style={{ color: 'var(--color-text-secondary)' }}
                title="Open Today & Quick Capture"
              >
                <Mic size={14} />
                <span>Quick Capture</span>
                <Kbd>RCtrl ×2</Kbd>
              </button>

              <ApprovalBell inline />

              {isChat && (
                <button
                  onClick={toggleSystemPanel}
                  className="tn-icon-btn"
                  aria-label={`${systemPanelOpen ? 'Hide' : 'Show'} system panel`}
                  title={`${systemPanelOpen ? 'Hide' : 'Show'} system panel (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+I)`}
                >
                  {systemPanelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
                </button>
              )}
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
