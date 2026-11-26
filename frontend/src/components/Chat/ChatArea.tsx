import { useRef, useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';
import { StreamingDots } from './StreamingDots';
import { useAppStore } from '../../lib/store';
import { shouldAutoplayFinishedReply, useTtsStore } from '../../lib/tts';
import { stripThinkTags } from '../../lib/message-text';
import { ArrowRight, X } from 'lucide-react';
import { LineBullet, Station } from '../transit';
import { listConnectors } from '../../lib/connectors-api';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 23) return 'Good evening';
  return 'Working late?';
}

export function ChatArea() {
  const activeId = useAppStore((s) => s.activeId);
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const wasStreaming = useRef(false);
  const lastScrollTop = useRef(0);
  const isCurrentChatStreaming = streamState.isStreaming && streamState.conversationId === activeId;

  // Autoplay: speak a reply once it is finished, never while it streams -- a
  // partial sentence would be synthesized and then cut off by the next chunk.
  // autoSpokenId fences the message so re-renders cannot repeat it.
  const voiceOutputEnabled = useAppStore((s) => s.settings.voiceOutputEnabled);
  const voiceAutoplay = useAppStore((s) => s.settings.voiceAutoplay);
  // Probe the backend as soon as voice output is switched on. Without this the
  // first reply could never autoplay: `available` is only set by ensureHealth,
  // which until now ran solely from the per-message read-aloud button -- and
  // that button does not exist until a reply is already on screen.
  useEffect(() => {
    if (!voiceOutputEnabled) return;
    useTtsStore.getState().ensureHealth();
  }, [voiceOutputEnabled]);

  // Speak on the falling edge of a stream -- the moment a reply finishes -- and
  // never merely because a finished reply happens to be on screen. Opening the
  // app or switching conversations would otherwise read stale history aloud,
  // and browsers block that anyway: playback with no preceding user gesture is
  // rejected outright, so the failure would be silent in both senses.
  const streamingConversationRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    const tts = useTtsStore.getState();
    const justFinished = shouldAutoplayFinishedReply(
      streamingConversationRef.current,
      activeId,
      streamState.isStreaming,
      last,
      tts.autoSpokenId,
    );
    streamingConversationRef.current = isCurrentChatStreaming ? activeId : null;

    if (!justFinished) return;
    if (!voiceOutputEnabled || !voiceAutoplay) return;

    if (!last || last.role !== 'assistant' || activeId === null) return;

    // Model loading may still be in flight when a fast reply completes. Wait
    // for the probe, then confirm that this is still the active finished reply.
    const completedConversationId = activeId;
    const completedMessageId = last.id;
    void tts.ensureHealth().then(() => {
      const app = useAppStore.getState();
      const currentTts = useTtsStore.getState();
      const currentLast = app.messages[app.messages.length - 1];
      if (app.activeId !== completedConversationId || app.streamState.isStreaming) return;
      if (!app.settings.voiceOutputEnabled || !app.settings.voiceAutoplay) return;
      if (currentLast?.id !== completedMessageId || currentTts.available !== true) return;
      if (currentTts.autoSpokenId === completedMessageId) return;

      const text = stripThinkTags(currentLast.content);
      if (!text) return;
      currentTts.markAutoSpoken(completedMessageId);
      void currentTts.speak(completedMessageId, text);
    });
  }, [activeId, messages, streamState.isStreaming, isCurrentChatStreaming, voiceOutputEnabled, voiceAutoplay]);
  const currentStreamContent = isCurrentChatStreaming ? streamState.content : '';

  // Check if any data sources are connected
  const [hasConnectedSources, setHasConnectedSources] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    listConnectors()
      .then((list) => setHasConnectedSources(list.some((c) => c.connected)))
      .catch(() => setHasConnectedSources(null));
  }, []);

  useEffect(() => {
    // Sending a message always pins the view to the bottom, even if the
    // user had scrolled up to read earlier messages.
    if (isCurrentChatStreaming && !wasStreaming.current) {
      shouldAutoScroll.current = true;
    }
    wasStreaming.current = isCurrentChatStreaming;
    if (shouldAutoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, currentStreamContent, isCurrentChatStreaming]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const distance = scrollHeight - scrollTop - clientHeight;
    const scrolledUp = scrollTop < lastScrollTop.current;
    lastScrollTop.current = scrollTop;
    if (scrolledUp && distance >= 1) {
      // Any upward scroll away from the bottom stops autoscroll immediately,
      // so streaming content never fights the user (no jitter). Sub-1px
      // upward movement (elastic bounce settling at the bottom) is ignored.
      shouldAutoScroll.current = false;
    } else if (!scrolledUp) {
      // Re-engage when scrolled back to the bottom. < 2 rather than < 1:
      // at fractional zoom levels the at-bottom residual can reach 1px,
      // which would otherwise leave autoscroll permanently disengaged.
      shouldAutoScroll.current = distance < 2;
    }
  };

  const isEmpty = messages.length === 0 && !isCurrentChatStreaming;

  const destinations: Array<{ letter: string; label: string; onClick: () => void }> = [
    { letter: 'T', label: 'Today & Morning Brief', onClick: () => navigate('/today') },
    { letter: 'D', label: 'Connect Data Sources', onClick: () => navigate('/data-sources') },
    {
      letter: 'D',
      label: 'Messaging Channels',
      onClick: () => { navigate('/data-sources'); setTimeout(() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'messaging' })), 100); },
    },
    { letter: 'W', label: 'Feature Walkthrough', onClick: () => navigate('/get-started') },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Data sources banner */}
      {hasConnectedSources === false && !bannerDismissed && (
        <div className="px-4 sm:px-6 pt-4 shrink-0">
          <div
            className="tn-panel tn-rule-top mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[14px]"
            style={{ maxWidth: 'calc(var(--chat-max-width) - 48px)', '--station-fill': 'var(--color-surface)' } as CSSProperties}
          >
            <Station line="data" />
            <span className="flex-1 min-w-[200px]" style={{ color: 'var(--color-text-secondary)' }}>
              Connect your data sources (Gmail, iMessage, Slack, etc.) to get personalized answers.
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate('/data-sources')}
                className="tn-btn tn-btn-sm"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="tn-icon-btn"
                aria-label="Dismiss"
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {isEmpty ? (
          <div className="flex flex-col justify-center min-h-full mx-auto w-full max-w-[var(--chat-max-width)] px-6 sm:px-10 py-10">
            <h2 className="text-[32px] leading-[38px] font-bold mb-3" style={{ color: 'var(--color-text)' }}>
              {getGreeting()}
            </h2>
            <p className="text-[15px] leading-[22px] max-w-[560px] mb-8" style={{ color: 'var(--color-text-secondary)' }}>
              Ask Friday anything — track your hackathons and projects, draft updates, or run deep research across your workspace.
            </p>

            {/* Destinations */}
            <ul className="max-w-[560px]" style={{ borderTop: '2px solid var(--color-text)' }}>
              {destinations.map((d) => (
                <li key={d.label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={d.onClick}
                    className="tn-dest group flex items-center gap-3 w-full h-12 px-2 text-left text-[15px] cursor-pointer"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <LineBullet letter={d.letter} size={24} />
                    <span className="flex-1 font-medium">{d.label}</span>
                    <ArrowRight size={16} className="tn-dest-arrow" style={{ color: 'var(--color-text-tertiary)' }} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="max-w-[var(--chat-max-width)] mx-auto px-4 sm:px-6 py-8">
            {messages.map((msg, i) => {
              const isLastAssistant =
                i === messages.length - 1 && msg.role === 'assistant';
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLive={isLastAssistant && isCurrentChatStreaming}
                />
              );
            })}
            {(() => {
              if (!isCurrentChatStreaming || streamState.content !== '') return null;
              // For research messages the ResearchTimeline handles its own
              // pre-content loading state — suppress the live route head.
              const last = messages[messages.length - 1];
              if (last?.role === 'assistant' && last.isResearch) return null;
              return (
                <div className="flex justify-start mb-4">
                  <StreamingDots phase={streamState.phase} />
                </div>
              );
            })()}
          </div>
        )}
      </div>
      <InputArea />
    </div>
  );
}