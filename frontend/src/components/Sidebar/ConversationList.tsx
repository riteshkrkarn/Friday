import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAppStore } from '../../lib/store';

interface Props {
  searchQuery: string;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const ROW_ACTION =
  'tn-strip-icon opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity';

export function ConversationList({ searchQuery }: Props) {
  const navigate = useNavigate();
  const conversations = useAppStore((s) => s.conversations);
  const activeId = useAppStore((s) => s.activeId);
  const streamingConversationId = useAppStore((s) =>
    s.streamState.isStreaming ? s.streamState.conversationId : null,
  );
  const selectConversation = useAppStore((s) => s.selectConversation);
  const renameConversation = useAppStore((s) => s.renameConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setDraftTitle(currentTitle);
  };

  const commitRename = (id: string) => {
    if (draftTitle.trim()) {
      renameConversation(id, draftTitle);
    }
    setEditingId(null);
  };

  const filtered = searchQuery
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : conversations;

  if (filtered.length === 0) {
    return (
      <div className="px-5 py-6 text-[13px]" style={{ color: 'var(--strip-muted)' }}>
        {searchQuery ? 'No matching chats' : 'No conversations yet'}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {filtered.map((conv) => {
        const isActive = conv.id === activeId;
        const isStreaming = conv.id === streamingConversationId;
        return (
          <div
            key={conv.id}
            className="tn-convo group flex items-center pr-2 cursor-pointer"
            data-active={isActive ? 'true' : undefined}
          >
            <button
              onClick={() => {
                if (editingId === conv.id) return;
                selectConversation(conv.id);
                navigate('/');
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(conv.id, conv.title);
              }}
              className="flex-1 text-left pl-5 pr-1 py-1.5 min-w-0 cursor-pointer"
              aria-current={isActive ? 'true' : undefined}
            >
              {editingId === conv.id ? (
                <input
                  type="text"
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename(conv.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingId(null);
                    }
                  }}
                  onBlur={() => commitRename(conv.id)}
                  className="w-full bg-transparent text-[14px] leading-5 outline-none border-b-2"
                  style={{ color: 'var(--strip-text)', borderColor: 'var(--strip-text)' }}
                />
              ) : (
                <div
                  className="text-[14px] leading-5 truncate"
                  style={{
                    color: isActive ? 'var(--strip-text)' : 'var(--strip-muted)',
                    fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {conv.title}
                </div>
              )}
              <div className="tn-mono text-[11px] leading-4" style={{ color: 'var(--strip-muted)' }}>
                {formatRelativeTime(conv.updatedAt)}
              </div>
            </button>
            {editingId === conv.id ? (
              <div className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    commitRename(conv.id);
                  }}
                  className="tn-strip-icon"
                  style={{ color: 'var(--strip-text)' }}
                  title="Save title"
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                  }}
                  className="tn-strip-icon"
                  title="Cancel"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(conv.id, conv.title);
                  }}
                  className={ROW_ACTION}
                  title="Rename conversation"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  disabled={isStreaming}
                  className={`${ROW_ACTION} disabled:opacity-30`}
                  title={
                    isStreaming
                      ? 'Stop generating before deleting this conversation'
                      : 'Delete conversation'
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
