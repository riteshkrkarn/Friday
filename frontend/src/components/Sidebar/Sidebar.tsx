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

  const navItems = [
    { path: '/', icon: MessageSquare, label: 'Chat' },
    { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { path: '/data-sources', icon: Database, label: 'Data Sources' },
    { path: '/agents', icon: Bot, label: 'Agents' },
    { path: '/logs', icon: ScrollText, label: 'Logs' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/get-started', icon: Rocket, label: 'Get Started' },
  ];

  const activeModelName = deepResearch
    ? 'Deep Research'
    : selectedModel || serverInfo?.model || 'Select model';

  return (
    <>
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-1.5 left-2 z-30 p-1.5 rounded-md transition-colors cursor-pointer"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
          }}
          aria-label="Open sidebar"
        >
          <PanelLeft size={16} />
        </button>
      )}

      <aside
        className={`
          flex flex-col h-full shrink-0 transition-all duration-200 ease-out overflow-hidden
          fixed md:relative z-30
          ${sidebarOpen ? 'w-[256px]' : 'w-0'}
        `}
        style={{
          background: 'var(--color-sidebar)',
          borderRight: sidebarOpen ? '1px solid var(--color-border)' : 'none',
        }}
      >
        <div className="flex flex-col h-full w-[256px]">
          {/* Brand & Controls Header */}
          <div
            className="h-10 flex items-center justify-between px-3 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
                <circle cx="12" cy="12" r="3" fill="var(--color-accent)" stroke="none" />
              </svg>
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                OpenJarvis
              </span>
            </button>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handleNewChat}
                className="p-1.5 rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Start new chat"
                title="New chat"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <Plus size={15} />
              </button>
              <button
                onClick={() => updateSettings({ theme: nextTheme })}
                className="p-1.5 rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label={`Switch theme to ${nextTheme}`}
                title={`Theme: ${settings.theme} (click for ${nextTheme})`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <ThemeIcon size={15} />
              </button>
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close sidebar"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
          </div>

          {/* Primary Navigation */}
          <nav className="px-2 py-2.5 flex flex-col gap-0.5 shrink-0">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors w-full text-left cursor-pointer"
                  style={{
                    background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    fontWeight: isActive ? 500 : 400,
                    border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--color-bg-secondary)';
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
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-sm"
                      style={{ background: 'var(--color-accent)' }}
                    />
                  )}
                  <item.icon
                    size={15}
                    style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Active Model Hardware Slot */}
          <div className="px-3 py-2 shrink-0" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full flex flex-col gap-1 px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-text-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <div className="flex items-center justify-between w-full">
                <span className="hw-label">Active model</span>
                <kbd
                  className="text-[10px] px-1.5 py-0.5 rounded hw-mono"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-tertiary)',
                    border: '1px solid var(--color-border)',
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
                    className="hw-led"
                    style={{
                      background: deepResearch ? 'var(--color-accent-blue)' : 'var(--color-success)',
                    }}
                  />
                )}
                <span
                  className="text-xs truncate hw-mono font-medium"
                  style={{ color: deepResearch ? 'var(--color-accent-blue)' : 'var(--color-text)' }}
                >
                  {activeModelName}
                </span>
              </div>
            </button>
          </div>

          {/* History Header & Search */}
          <div className="px-3 pt-3 pb-1.5 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="hw-label">History</span>
              <button
                onClick={handleNewChat}
                className="text-[11px] font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                + New
              </button>
            </div>
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs"
              style={{
                background: 'var(--color-bg-secondary)',
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
