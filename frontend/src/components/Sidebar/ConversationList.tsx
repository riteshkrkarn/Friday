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
      <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {searchQuery ? 'No matching chats' : 'No conversations yet'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {filtered.map((conv) => {
        const isActive = conv.id === activeId;
        const isStreaming = conv.id === streamingConversationId;
        return (
          <div
            key={conv.id}
            className="group flex items-center rounded-md cursor-pointer transition-colors"
            style={{
              background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
              border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'var(--color-bg-secondary)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
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
              className="flex-1 text-left px-2.5 py-1.5 min-w-0 cursor-pointer"
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
                  className="w-full bg-transparent text-[13px] outline-none border-b"
                  style={{
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-accent)',
                  }}
                />
              ) : (
                <div
                  className="text-[13px] truncate"
                  style={{
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {conv.title}
                </div>
              )}
              <div className="text-[10px] mt-0.5 hw-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                {formatRelativeTime(conv.updatedAt)}
              </div>
            </button>
            {editingId === conv.id ? (
              <div className="flex items-center mr-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    commitRename(conv.id);
                  }}
                  className="p-1 rounded cursor-pointer"
                  style={{ color: 'var(--color-accent)' }}
                  title="Save title"
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                  }}
                  className="p-1 rounded cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title="Cancel"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="flex items-center mr-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(conv.id, conv.title);
                  }}
                  className="p-1.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
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
                  className="p-1.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => {
                    if (!isStreaming) e.currentTarget.style.color = 'var(--color-error)';
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
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
