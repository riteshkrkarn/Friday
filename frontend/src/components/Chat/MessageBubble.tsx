import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { Copy, Check } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { ToolCallCard } from './ToolCallCard';
import { ResearchTimeline } from './ResearchTimeline';
import { rehypeCitations } from '../../lib/rehype-citations';
import { RouteStrip } from './RouteStrip';
import { SpeakMessageButton } from './SpeakMessageButton';
import type { ChatMessage } from '../../types';
import { stripThinkTags } from '../../lib/message-text';

interface Props {
  message: ChatMessage;
  isLive?: boolean;
}

function getTextContent(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }
  if (node?.props?.children) {
    return getTextContent(node.props.children);
  }
  return '';
}

// Each block picks its own direction from its first strong character, so an
// Arabic paragraph next to English text renders right-to-left with its
// punctuation in place. Code blocks explicitly stay left-to-right.
const AUTO_DIR_TAGS = ['p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'th', 'td'] as const;

const autoDirComponents = Object.fromEntries(
  AUTO_DIR_TAGS.map((Tag) => [
    Tag,
    ({ node: _node, ...props }: any) => <Tag dir="auto" {...props} />,
  ]),
);

function CodeBlockPre({ children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || '';
  const match = /language-([\w-]+)/.exec(className);
  const lang = match ? match[1] : '';
  const code = getTextContent(codeElement?.props?.children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="code-block-wrapper relative my-3"
      dir="ltr"
      style={{ border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}
    >
      <div
        className="flex items-center justify-between h-8 pl-4 pr-1"
        style={{
          background: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span className="tn-mono text-[12px]">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="tn-btn tn-btn-ghost tn-btn-sm"
          style={{ height: 24, fontSize: 12, color: 'var(--color-text-secondary)' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props} style={{ margin: 0, borderRadius: 0 }}>
        {children}
      </pre>
    </div>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="tn-btn tn-btn-ghost tn-btn-sm tn-reveal"
      style={{ color: 'var(--color-text-secondary)' }}
      title="Copy message"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function MessageBubble({ message, isLive = false }: Props) {
  const isUser = message.role === 'user';

  const cleanContent = useMemo(() => stripThinkTags(message.content), [message.content]);

  // Build a ref→source lookup once per render. Memoized so the rehype plugin
  // identity stays stable until the source list actually changes.
  const sourcesMap = useMemo(() => {
    const m = new Map<number, NonNullable<ChatMessage['researchSources']>[number]>();
    for (const s of message.researchSources ?? []) {
      if (typeof s.ref === 'number') m.set(s.ref, s);
    }
    return m;
  }, [message.researchSources]);

  const rehypePlugins = useMemo(() => {
    const base: any[] = [[rehypeHighlight, { detect: true }], rehypeKatex];
    if (sourcesMap.size > 0) base.push([rehypeCitations, { sources: sourcesMap }]);
    return base;
  }, [sourcesMap]);

  if (isUser) {
    return (
      <div className="flex justify-end mb-6">
        <div
          dir="auto"
          className="max-w-[min(560px,90%)] px-4 py-2.5 text-[15px] leading-[22px]"
          style={{
            background: 'var(--user-block-bg)',
            color: 'var(--user-block-text)',
            borderRadius: 2,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="group mb-8 max-w-[720px]">
      {/* Route strip: where this reply went */}
      <RouteStrip message={message} isLive={isLive} />

      {/* Deep Research timeline (steps + status) */}
      {(message.isResearch || (message.researchTraces && message.researchTraces.length > 0)) && (
        <ResearchTimeline
          traces={message.researchTraces ?? []}
          isLive={isLive}
          hasContent={cleanContent.length > 0}
        />
      )}

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Audio player (e.g. morning digest) */}
      {message.audio?.url && <AudioPlayer src={message.audio.url} />}

      {/* Assistant message */}
      {cleanContent && (
        <div className="prose max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={rehypePlugins}
            components={{
              ...autoDirComponents,
              pre: CodeBlockPre,
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>
      )}

      {/* Actions: copy + read aloud */}
      {cleanContent && (
        <div className="flex flex-wrap items-center gap-1 mt-2 -ml-2.5">
          <CopyMessageButton content={cleanContent} />
          {!isUser && !isLive && (
            <SpeakMessageButton messageId={message.id} content={cleanContent} />
          )}
        </div>
      )}
    </div>
  );
}