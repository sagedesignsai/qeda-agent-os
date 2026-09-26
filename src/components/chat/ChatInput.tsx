/**
 * components/chat/ChatInput.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompt input bar using ai-elements PromptInput component.
 * Supports multi-line input with Shift+Enter, sends on Enter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, type ReactNode } from 'react';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  /** Rendered at the start of the footer row — e.g. a model indicator. */
  footerLeft?: ReactNode;
  /** Taller textarea, for the empty-state hero composer. */
  tall?: boolean;
  className?: string;
}

export function ChatInput({
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  placeholder = 'Ask me anything… (Enter to send, Shift+Enter for newline)',
  footerLeft,
  tall = false,
  className,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (message: PromptInputMessage) => {
    const content = message.text.trim();
    if (!content || disabled) return;
    onSend(content);
    setText('');
  };

  return (
    <PromptInput onSubmit={handleSubmit} className={className}>
      <PromptInputBody>
        <PromptInputTextarea
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled && !isStreaming}
          className={cn('resize-none', tall ? 'min-h-28' : 'min-h-[56px]')}
        />
      </PromptInputBody>
      {/* With a footer-left slot the row splits (indicator | submit); without
          one it collapses to a right-aligned submit. */}
      <PromptInputFooter className={footerLeft ? 'justify-between' : 'justify-end'}>
        <PromptInputTools>{footerLeft}</PromptInputTools>
        <PromptInputSubmit
          status={isStreaming ? 'streaming' : undefined}
          onStop={onStop}
          disabled={!text.trim() && !isStreaming}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
