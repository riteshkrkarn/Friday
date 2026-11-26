import { useEffect, useSyncExternalStore } from 'react';
import { ChatArea } from '../components/Chat/ChatArea';
import { SystemPanel } from '../components/Chat/SystemPanel';
import { useAppStore } from '../lib/store';

const WIDE_QUERY = '(min-width: 1024px)';

function subscribeWide(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function isWide() {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY).matches : true;
}

export function ChatPage() {
  const systemPanelOpen = useAppStore((s) => s.systemPanelOpen);
  const setSystemPanelOpen = useAppStore((s) => s.setSystemPanelOpen);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const drawerOpen = systemPanelOpen && !wide;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSystemPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, setSystemPanelOpen]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0">
        <ChatArea />
      </div>
      {systemPanelOpen && wide && <SystemPanel />}
      {drawerOpen && (
        <>
          <div className="tn-scrim z-40" onClick={() => setSystemPanelOpen(false)} aria-hidden="true" />
          <div className="fixed inset-y-0 right-0 z-40 max-w-full">
            <SystemPanel className="max-w-[100vw]" />
          </div>
        </>
      )}
    </div>
  );
}
