/**
 * components/copilot/CopilotPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Focus Copilot panel — a conversational agent over the task system.
 *
 * It reuses the chat surface's `MessageList` (tool cards, approval cards,
 * streaming markdown) so an agent turn looks identical wherever it happens, and
 * the ai-elements `Conversation` + `PromptInput` primitives for the frame.
 *
 * All state comes from `useCopilotChat`; this component is presentation only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BotIcon, SparklesIcon } from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MessageList } from '@/components/chat/MessageList';
import { useCopilotChat } from '@/hooks/use-copilot-chat';
import { useIpcEvent } from '@/hooks/use-ipc';

const SUGGESTIONS = [
  'What should I focus on first today, and why?',
  'Break down my most important task into steps I can start in two minutes.',
  'Look at my open tasks and plan a realistic day with breathing room.',
  'Check my focus progress and suggest one change to my workload.',
];

export interface CopilotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a turn that may have changed tasks, blocks, or sessions. */
  onChanged?: () => void;
}

export function CopilotPanel({
  open,
  onOpenChange,
  onChanged,
}: CopilotPanelProps) {
  const {
    messages,
    status,
    error,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useCopilotChat();

  // Tool calls can mutate task data; let the board know after each turn.
  useIpcEvent('copilot:changed', () => onChanged?.());

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <BotIcon className="size-6 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">Focus Copilot</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Capture what&apos;s in your head, break work into small steps, and
          shape a day you&apos;ll actually finish.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => sendMessage(suggestion)}
            className="rounded-md border border-border/60 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 pr-8">
            <SparklesIcon className="size-4 text-amber-500" />
            Focus Copilot
          </SheetTitle>
          <SheetDescription>
            An agent with tools over your tasks, calendar, focus stats, the web,
            and your workspace.
          </SheetDescription>
        </SheetHeader>

        <Conversation className="flex-1">
          <ConversationContent className="p-0">
            <MessageList
              messages={messages}
              status={status}
              error={error}
              onApproval={respondToApproval}
              emptyState={emptyState}
            />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border/60 p-3">
          <PromptInput
            onSubmit={({ text }) => {
              const value = text.trim();
              if (value) sendMessage(value);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea placeholder="Ask, dump, plan, or break something down…" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={clearMessages}
                  disabled={messages.length === 0}
                >
                  Clear
                </Button>
              </PromptInputTools>
              <PromptInputSubmit
                status={status}
                disabled={status === 'streaming'}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </SheetContent>
    </Sheet>
  );
}
