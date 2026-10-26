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
  /**
   * Controlled text. Omit for the self-managed default (Chat, Documents).
   *
   * Builder's welcome view needs the draft to live in the shared workspace
   * store, not inside this component: a user can describe an idea before a
   * codebase exists, and that draft has to survive the transition into the
   * real Builder conversation when a session is finally created.
   */
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * Clear the composer after `onSend`. Defaults to true for a normal chat
   * turn. Builder's welcome view sets this false because sending first asks
   * for a workspace; the draft must survive a cancelled folder picker.
   */
  clearOnSend?: boolean;
  /**
   * Rendered immediately before the submit button.
   *
   * Builder uses this for its codebase picker: what you will build in changes
   * the same turn you submit, so it belongs beside the action it qualifies
   * rather than in a separate panel above the composer.
   */
  beforeSubmit?: ReactNode;
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
  value,
  onValueChange,
  clearOnSend = true,
  beforeSubmit,
}: ChatInputProps) {
  const [internalText, setInternalText] = useState('');
  const controlled = value !== undefined;
  const text = controlled ? value : internalText;

  const setText = (next: string) => {
    if (!controlled) setInternalText(next);
    onValueChange?.(next);
  };

  const handleSubmit = (message: PromptInputMessage) => {
    const content = message.text.trim();
    if (!content || disabled) return;
    onSend(content);
    if (clearOnSend) setText('');
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
      {/* With a footer-left slot the row splits (indicator | right cluster);
          without one it collapses to a right-aligned cluster. The right cluster
          keeps `beforeSubmit` and the submit button adjacent, because a control
          that qualifies the submit action should read as part of it. */}
      <PromptInputFooter
        className={cn(
          'gap-1.5',
          footerLeft ? 'justify-between' : 'justify-end',
        )}
      >
        {footerLeft ? <PromptInputTools>{footerLeft}</PromptInputTools> : null}
        <div className="flex shrink-0 items-center gap-1.5">
          {beforeSubmit}
          <PromptInputSubmit
            status={isStreaming ? 'streaming' : undefined}
            onStop={onStop}
            disabled={!text.trim() && !isStreaming}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}
