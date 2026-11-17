/**
 * components/presence/PresenceChatThread.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The animated coach thread that replaces the suggestion queue when the user
 * starts typing.
 *
 * It reuses the same `MessageList` + `Conversation` primitives as every other
 * copilot in the app, so tool cards, approval requests, streaming markdown, and
 * retry behaviour are identical here. This component is presentation only; the
 * transport lives in `usePresenceChat`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BotIcon, XIcon } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { MessageList } from '@/components/chat/MessageList';
import { PlanPanel } from '@/components/plan/PlanPanel';
import type { PresenceChatState } from '@/hooks/use-presence-chat';

const STARTERS = [
  'Draft a LinkedIn post about what I shipped this week.',
  'Who in my contacts is worth reconnecting with, and why?',
  'Turn my latest project update into a short thread.',
  'Find a community where my work would be welcome.',
];

interface PresenceChatThreadProps {
  chat: PresenceChatState;
}

export function PresenceChatThread({ chat }: PresenceChatThreadProps) {
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    respondToApproval,
    sendMessage,
    plan,
  } = chat;

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-amber-500/15">
        <BotIcon className="size-5 text-amber-500" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight">
          Your presence coach
        </h3>
        <p className="mx-auto mt-1 max-w-[17rem] text-[11px] leading-relaxed text-muted-foreground">
          I can draft, plan a week of posts, or work through who to reach. I
          never post for you — you copy, publish, and tell me what happened.
        </p>
      </div>
      <div className="flex w-full max-w-[18rem] flex-col gap-1">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => sendMessage(starter)}
            className="rounded-md border border-border/60 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-amber-500/40 hover:text-foreground"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="p-0 pb-24">
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
        {plan && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-background/85 px-2 pb-2 backdrop-blur-xs">
            <PlanPanel
              plan={plan}
              isRunning={status === 'streaming'}
              title="Coach plan"
              compact
            />
          </div>
        )}
      </Conversation>

      {fallbackNotice && (
        <div className="mx-2 mb-1.5 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
          <span className="truncate">
            <strong>{fallbackNotice.fromProvider}</strong> unavailable (
            {fallbackNotice.reason}) — switched to{' '}
            <strong>{fallbackNotice.toProvider}</strong>
          </span>
          <button
            type="button"
            onClick={dismissFallbackNotice}
            className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
            aria-label="Dismiss fallback notice"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
