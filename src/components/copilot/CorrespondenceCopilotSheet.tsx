/**
 * components/copilot/CorrespondenceCopilotSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Correspondence Copilot — a slide-over agent over the correspondence board.
 *
 * WHY THIS IS THE COPILOT FRAME, NOT THE DRAFTER OR THE GENERATOR
 * It is an agent conversation with tools over the correspondence store, the same
 * structural choice as the Focus Copilot and the Document Drafter. It reuses the
 * chat surface's `MessageList` (tool cards, approval cards, streaming markdown) so
 * a turn looks identical wherever it happens, and the ai-elements `Conversation` +
 * `PromptInput` primitives for the frame.
 *
 * WHAT MAKES IT CORRESPONDENCE-SPECIFIC
 *   - the honest-verb promise is stated once and plainly: this agent records what
 *     was sent, it does not send anything. That is the same constraint the composer
 *     and the whole module enforce, and it is the one thing worth saying to the user
 *     once instead of repeating.
 *   - the empty state names the four things it is for: reading the board, drafting a
 *     message and who it goes to, proposing the clock, and filing a reply or chasing
 *     a quiet body.
 *   - the context strip is the project scope, because this agent is most useful
 *     grounded in the project the board is already filtered to.
 *
 * WHAT IT DOES NOT DO
 *   - send, file, email, post, portal-submit, or otherwise deliver anything. There
 *     is no tool for it in the agent's set and no path by which one could be added
 *     without a new tool being the actual check.
 *   - decide for the user. It proposes recipients, channels, clocks, reply
 *     classifications, and escalation text; the user confirms.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { MailIcon, SendIcon, SparklesIcon, PlusIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
import { ActiveProjectNotice } from '@/components/projects/ActiveProjectNotice';
import { PlanPanel } from '@/components/plan/PlanPanel';
import { useCorrespondenceCopilot } from '@/hooks/use-correspondence-copilot';
import { useIpcPlan } from '@/hooks/use-agent-plan';
import { useIpcEvent } from '@/hooks/use-ipc';

const SUGGESTIONS = [
  'What is on the board right now, and what is overdue?',
  'Draft a letter of demand to the contact I select and tell me who it goes to.',
  'Propose a reply deadline for this dispatch before I record the send.',
  'I got a reply from one of these bodies — how should I file it?',
  'Draft a chase task for the ones that went quiet.',
];

export interface CorrespondenceCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Scope the copilot to a project so it reads the scoped board. */
  projectId?: string | null;
  /** Fired after a turn that may have changed correspondence state. */
  onChanged?: () => void;
  /** Initial prompt to dispatch once when opened. */
  initialPrompt?: string | null;
}

export function CorrespondenceCopilotSheet({
  open,
  onOpenChange,
  projectId,
  onChanged,
  initialPrompt,
}: CorrespondenceCopilotSheetProps) {
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages: rawClearMessages,
  } = useCorrespondenceCopilot({ projectId: projectId ?? undefined });

  const { plan, clearPlan } = useIpcPlan(
    'correspondence-copilot:plan-event',
    messages,
  );

  const clearMessages = () => {
    clearPlan();
    rawClearMessages();
  };

  // Seed the first turn once, exactly like the other copilot sheets.
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      sendMessage(initialPrompt.trim());
    }
  }, [open, initialPrompt, sendMessage]);

  // Correspondence state can change during a turn (draft, recipients, dispatch,
  // escalation). Let the owning surface refresh after each turn.
  useIpcEvent('correspondence:changed', () => onChanged?.());

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <MailIcon className="size-6 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">Correspondence Copilot</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Read the board, draft a message and who it goes to, propose the reply
          clock, and file a reply or chase a quiet body.
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
              Correspondence Copilot
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
            Reads the board and registry, drafts messages and channels, proposes
            the reply clock, files replies and chases.
          </SheetDescription>

          <ActiveProjectNotice className="mt-2" compact />

          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <SendIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span>
              Records what was sent. Does not send, file, email, post, or portal
              anything for you.
            </span>
          </p>
        </SheetHeader>

        <Conversation className="flex-1">
          <ConversationContent className="p-0">
            {plan && (
              <div className="sticky top-0 z-20 p-3 bg-background/80 backdrop-blur-xs border-b border-border/40">
                <PlanPanel
                  plan={plan}
                  isRunning={status === 'streaming'}
                  title="Copilot Plan"
                />
              </div>
            )}
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
              Provider <strong>{fallbackNotice.fromProvider}</strong>{' '}
              unavailable ({fallbackNotice.reason}) — switched to{' '}
              <strong>{fallbackNotice.toProvider}</strong>
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
              <PromptInputTextarea
                placeholder="Ask, draft, propose, or file something…"
              />
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
