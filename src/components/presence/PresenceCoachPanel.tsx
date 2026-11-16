/**
 * components/presence/PresenceCoachPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The left pane: onboarding, the suggestion queue, or the coach thread.
 *
 * The prompt input is the hinge. Typing (or pressing a generator) swaps the queue
 * for the conversation with a short slide, and a "Queue" control swaps it back.
 * The chat hook stays mounted either way, so closing the thread mid-turn does not
 * lose the stream — the agent finishes and `presence:changed` refreshes the
 * queue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ListIcon, MessageSquareIcon, SparklesIcon } from 'lucide-react';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PresenceChatThread } from './PresenceChatThread';
import { PresenceOnboardingPanel } from './PresenceOnboardingPanel';
import { PresenceQueue } from './PresenceQueue';
import { usePresenceChat } from '@/hooks/use-presence-chat';
import { cn } from '@/lib/utils';
import type { PresenceProfile } from '@/main/ipc/channels';

export interface PresenceAutoPrompt {
  id: number;
  text: string;
}

interface PresenceCoachPanelProps {
  projectId: string | null;
  profile: PresenceProfile | null;
  profileLoading: boolean;
  counts: { pending: number; done: number; skipped: number; batches: number };
  platforms: string[];
  autoPrompt: PresenceAutoPrompt | null;
  onAutoPromptConsumed: () => void;
  /** Ask the page to seed a generation turn (used by onboarding and the queue). */
  onGenerate: () => void;
}

export function PresenceCoachPanel({
  projectId,
  profile,
  profileLoading,
  counts,
  platforms,
  autoPrompt,
  onAutoPromptConsumed,
  onGenerate,
}: PresenceCoachPanelProps) {
  const chat = usePresenceChat(projectId);
  const { sendMessage } = chat;
  const [chatOpen, setChatOpen] = useState(false);
  const lastSeed = useRef<number | null>(null);

  const needsOnboarding =
    !!projectId &&
    !profileLoading &&
    (profile === null || !profile.onboarding_complete);

  // A seed is dispatched exactly once per id, even under React's double-invoked
  // development effects.
  useEffect(() => {
    if (!autoPrompt || !projectId) return;
    if (lastSeed.current === autoPrompt.id) return;
    lastSeed.current = autoPrompt.id;
    setChatOpen(true);
    sendMessage(autoPrompt.text);
    onAutoPromptConsumed();
  }, [autoPrompt, projectId, sendMessage, onAutoPromptConsumed]);

  const clear = () => {
    chat.clearPlan();
    chat.clearMessages();
  };

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setChatOpen(true);
    chat.sendMessage(value);
  };

  const streaming = chat.status === 'streaming';

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Select a project to start building your presence.
        </p>
      </div>
    );
  }

  if (profileLoading && profile === null) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <PresenceOnboardingPanel
        projectId={projectId}
        initialPlatforms={platforms}
        initialGoal={profile?.goal ?? ''}
        onComplete={(generate) => {
          if (generate) onGenerate();
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <SparklesIcon className="size-3.5 shrink-0 text-amber-500" />
          <span className="truncate text-xs font-semibold tracking-tight">
            Presence Coach
          </span>
          {streaming ? (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
              working
            </span>
          ) : (
            !chatOpen && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                {counts.pending} to do
              </span>
            )
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setChatOpen((value) => !value)}
        >
          {chatOpen ? (
            <>
              <ListIcon className="size-3" />
              Queue
            </>
          ) : (
            <>
              <MessageSquareIcon className="size-3" />
              Chat
            </>
          )}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {chatOpen ? (
            <motion.div
              key="thread"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              <PresenceChatThread chat={chat} />
            </motion.div>
          ) : (
            <motion.div
              key="queue"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="absolute inset-0 overflow-y-auto"
            >
              <PresenceQueue
                projectId={projectId}
                onGenerate={onGenerate}
                generating={streaming}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-border/50 p-2">
        <PromptInput
          onSubmit={({ text }) => submit(text)}
          className={cn(streaming && 'opacity-90')}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask your coach, or describe what you want to post…"
              className="min-h-10 text-xs"
            />
          </PromptInputBody>
          <PromptInputFooter className="pt-1">
            <span className="px-1 text-[10px] text-muted-foreground">
              {streaming
                ? 'Coach is working…'
                : 'Copy drafts, post them yourself.'}
            </span>
            <PromptInputSubmit status={chat.status} onStop={chat.abortStream} />
          </PromptInputFooter>
        </PromptInput>
        {chatOpen && chat.messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={streaming}
            className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Start a new conversation
          </button>
        )}
      </div>
    </div>
  );
}
