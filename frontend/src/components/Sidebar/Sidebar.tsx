import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Plus, Search, PanelLeftClose, PanelLeft, Sun, Moon, Monitor } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { LineBullet } from '../transit';
import { useAppStore } from '../../lib/store';

const NAV_GROUPS: Array<Array<{ path: string; letter: string; label: string }>> = [
  [
    { path: '/', letter: 'C', label: 'Chat' },
    { path: '/today', letter: 'T', label: 'Today & Brief' },
    { path: '/agents', letter: 'A', label: 'Agents' },
    { path: '/data-sources', letter: 'D', label: 'Data Sources' },
  ],
  [
    { path: '/dashboard', letter: 'O', label: 'Overview' },
    { path: '/logs', letter: 'L', label: 'Logs' },
    { path: '/settings', letter: 'S', label: 'Settings' },
    { path: '/get-started', letter: 'W', label: 'Walkthrough' },
  ],
];

const THEME_NAMES = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);

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

  return (
    <>
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="tn-strip fixed top-4 left-3 z-30 w-8 h-8 flex items-center justify-center rounded-[2px] cursor-pointer"
          aria-label="Open sidebar"
        >
          <PanelLeft size={16} />
        </button>
      )}

      <aside
        className={`
          tn-strip flex flex-col h-full shrink-0 transition-[width] duration-200 ease-out overflow-hidden
          fixed md:relative z-30
          ${sidebarOpen ? 'w-[232px]' : 'w-0'}
        `}
        style={{ ['--station-fill' as string]: 'var(--strip-bg)' }}
      >
        <div className="flex flex-col h-full w-[232px]">
          {/* Wordmark over the 4px rule */}
          <div className="flex items-center justify-between pl-5 pr-3 h-[60px] shrink-0">
            <button
              onClick={() => navigate('/')}
              className="text-[20px] leading-6 font-bold cursor-pointer rounded-[2px]"
              style={{ color: 'var(--strip-text)' }}
            >
              OpenJarvis
            </button>
            <button onClick={toggleSidebar} className="tn-strip-icon" aria-label="Close sidebar">
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div aria-hidden="true" className="shrink-0" style={{ height: 'var(--rule-bar)', background: 'var(--strip-text)' }} />

          <nav aria-label="Primary" className="py-3 flex flex-col gap-2 shrink-0">
            {NAV_GROUPS.map((group, gi) => (
              <div key={gi} className="flex flex-col">
                {group.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="tn-strip-row"
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <LineBullet letter={item.letter} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div aria-hidden="true" className="mx-5 shrink-0" style={{ height: 1, background: 'var(--strip-rule)' }} />

          {/* Conversations */}
          <div className="px-5 pt-4 pb-2 shrink-0 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 className="tn-strip-label">Conversations</h2>
              <button
                onClick={handleNewChat}
                className="tn-strip-icon w-auto shrink-0 whitespace-nowrap px-2 gap-1.5 text-[13px] font-medium"
                style={{ color: 'var(--strip-text)' }}
                aria-label="Start new chat"
                title="New chat"
              >
                <Plus size={14} />
                New chat
              </button>
            </div>
            <div className="relative">
              <Search
                size={14}
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--strip-muted)' }}
              />
              <input
                type="text"
                placeholder="Filter chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="tn-strip-input"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-2 min-h-0">
            <ConversationList searchQuery={searchQuery} />
          </div>

          {/* Theme */}
          <div className="shrink-0 px-3 py-2 flex items-center" style={{ borderTop: '1px solid var(--strip-rule)' }}>
            <button
              onClick={() => updateSettings({ theme: nextTheme })}
              className="tn-strip-icon w-auto px-2 gap-2 text-[13px]"
              aria-label={`Switch theme to ${nextTheme}`}
              title={`Theme: ${settings.theme} (click for ${nextTheme})`}
            >
              <ThemeIcon size={15} />
              <span>{THEME_NAMES[settings.theme]} theme</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
