import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  MessageSquare,
  Plus,
  BarChart3,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeft,
  Rocket,
  Bot,
  Sun,
  Moon,
  Monitor,
  Loader2,
  ScrollText,
  Database,
  CalendarCheck2,
} from 'lucide-react';
import { ConversationList } from './ConversationList';
import { useAppStore } from '../../lib/store';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const deepResearch = useAppStore((s) => s.deepResearch);

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const ThemeIcon = settings.theme === 'light' ? Sun : settings.theme === 'dark' ? Moon : Monitor;
  const nextTheme = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light';

  const messages = useAppStore((s) => s.messages);
  const handleNewChat = () => {
    if (messages.length === 0) {
      navigate('/');
      return;
    }
    createConversation(selectedModel);
    navigate('/');
  };

  const assistantNav = [
    { path: '/', icon: MessageSquare, label: 'Chat' },
    { path: '/today', icon: CalendarCheck2, label: 'Today & Brief' },
    { path: '/agents', icon: Bot, label: 'Agents' },
    { path: '/data-sources', icon: Database, label: 'Data Sources' },
  ];

  const studioNav = [
    { path: '/dashboard', icon: BarChart3, label: 'Overview' },
    { path: '/logs', icon: ScrollText, label: 'Logs' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/get-started', icon: Rocket, label: 'Walkthrough' },
  ];

  const activeModelName = deepResearch
    ? 'Deep Research'
    : selectedModel || serverInfo?.model || 'Select model';

  const renderNavGroup = (label: string, items: typeof assistantNav) => (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </div>
      {items.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors w-full text-left cursor-pointer"
            style={{
              background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
              color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
              fontWeight: isActive ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                e.currentTarget.style.color = 'var(--color-text)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }
            }}
          >
            <item.icon
              size={16}
              style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-2.5 left-3 z-30 w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer studio-glass border"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Open sidebar"
        >
          <PanelLeft size={16} />
        </button>
      )}

      <aside
        className={`
          flex flex-col h-full shrink-0 transition-all duration-200 ease-out overflow-hidden
          fixed md:relative z-30 studio-glass
          ${sidebarOpen ? 'w-[264px]' : 'w-0'}
        `}
        style={{
          background: 'var(--color-sidebar)',
          borderRight: sidebarOpen ? '1px solid var(--color-glass-border)' : 'none',
        }}
      >
        <div className="flex flex-col h-full w-[264px]">
          {/* Brand & Window Controls */}
          <div
            className="h-12 flex items-center justify-between px-3.5 shrink-0"
            style={{ borderBottom: '1px solid var(--color-glass-border)' }}
          >
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: 'var(--color-accent-subtle)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
                  <path d="M9.5 16.5V8h6" />
                  <path d="M9.5 12h4.2" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                Friday
              </span>
            </button>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handleNewChat}
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Start new chat"
                title="New chat"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => updateSettings({ theme: nextTheme })}
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label={`Switch theme to ${nextTheme}`}
                title={`Theme: ${settings.theme} (click for ${nextTheme})`}
              >
                <ThemeIcon size={15} />
              </button>
              <button
                onClick={toggleSidebar}
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
          </div>

          {/* Primary Navigation (2 clean groups) */}
          <nav className="px-2.5 py-2 flex flex-col gap-2 shrink-0">
            {renderNavGroup('Assistant', assistantNav)}
            {renderNavGroup('Studio', studioNav)}
          </nav>

          {/* Active Model Card */}
          <div className="px-3 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--color-glass-border)', borderBottom: '1px solid var(--color-glass-border)' }}>
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full flex flex-col gap-1 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="studio-label">Model</span>
                <kbd
                  className="text-[11px] px-1.5 py-0.5 rounded studio-mono"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  ⌘K
                </kbd>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                {modelLoading ? (
                  <Loader2 size={12} className="animate-spin shrink-0" style={{ color: 'var(--color-accent)' }} />
                ) : (
                  <span
                    className="studio-dot"
                    style={{
                      background: deepResearch ? 'var(--color-accent)' : 'var(--color-success)',
                    }}
                  />
                )}
                <span
                  className="text-xs truncate font-medium"
                  style={{ color: deepResearch ? 'var(--color-accent)' : 'var(--color-text)' }}
                >
                  {activeModelName}
                </span>
              </div>
            </button>
          </div>

          {/* History Header & Search */}
          <div className="px-3 pt-3 pb-1.5 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="studio-label">Conversations</span>
              <button
                onClick={handleNewChat}
                className="text-xs font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                + New
              </button>
            </div>
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Search size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                type="text"
                placeholder="Filter chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-xs"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <ConversationList searchQuery={searchQuery} />
          </div>
        </div>
      </aside>
    </>
  );
}
