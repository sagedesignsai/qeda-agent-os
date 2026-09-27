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

import { BotIcon, PlusIcon, SparklesIcon, XIcon } from 'lucide-react';

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
  /** Scope the copilot to a project so it defaults new tasks there. */
  projectId?: string | null;
  /** Fired after a turn that may have changed tasks, blocks, or sessions. */
  onChanged?: () => void;
}

export function CopilotPanel({
  open,
  onOpenChange,
  projectId,
  onChanged,
}: CopilotPanelProps) {
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useCopilotChat({ projectId: projectId ?? undefined });

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
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SparklesIcon className="size-4 text-amber-500" />
              Focus Copilot
            </SheetTitle>
            <div className="mr-6 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={clearMessages}
                title="New session / Clear"
                disabled={messages.length === 0}
              >
                <PlusIcon className="size-3.5" />
                <span className="sr-only">New session</span>
              </Button>
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            An agent with tools over your tasks, calendar, stats, and workspace.
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
              onRetry={(text) => sendMessage(text)}
            />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {fallbackNotice && (
          <div className="mx-3 my-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
            <span className="truncate">
              Provider <strong>{fallbackNotice.fromProvider}</strong> unavailable ({fallbackNotice.reason}) — switched to <strong>{fallbackNotice.toProvider}</strong>
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 shrink-0 text-amber-500 hover:text-amber-400"
              onClick={dismissFallbackNotice}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        )}

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
