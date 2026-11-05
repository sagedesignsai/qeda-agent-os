/**
 * components/chat/MessageList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Simplified message list for SoundLab copilot. Renders AI messages as plain
 * text blocks. Full-featured version lives in Qeda; this is enough for the
 * standalone copilot sheet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type UIMessage } from 'ai';
import { cn } from '@/lib/utils';

export interface MessageListProps {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'error';
}

export function MessageList({ messages, status }: MessageListProps) {
  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Ask the copilot to help you build a soundscape.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            'rounded-lg p-3 text-sm',
            msg.role === 'user'
              ? 'bg-primary/10 ml-auto max-w-[80%]'
              : 'bg-muted mr-auto max-w-[80%]',
          )}
        >
          {msg.parts?.map((part, i) => {
            if (part.type === 'text') return <p key={i}>{part.text}</p>;
            if (part.type === 'tool-invocation') {
              return (
                <p key={i} className="text-xs text-muted-foreground">
                  🛠 {part.toolName}
                </p>
              );
            }
            return null;
          })}
        </div>
      ))}
      {status === 'streaming' && (
        <div className="text-muted-foreground text-xs animate-pulse">Thinking…</div>
      )}
    </div>
  );
}
