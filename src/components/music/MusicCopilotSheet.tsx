/**
 * components/music/MusicCopilotSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Music Copilot surface: a conversational DJ over the local library.
 *
 * It shares the same conversation/tool-card renderer as every other copilot, so
 * tool calls are visible instead of hidden behind a spinner. The sheet is
 * mounted by the Music page (and opened by the palette via `?copilot=1`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import {
  ListMusicIcon,
  PlusIcon,
  SparklesIcon,
  TimerIcon,
  Volume2Icon,
  WavesIcon,
  XIcon,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MessageList } from '@/components/chat/MessageList';
import { useMusicCopilot } from '@/hooks/use-music-copilot';

const SUGGESTIONS = [
  {
    icon: <ListMusicIcon className="size-3.5 shrink-0 text-emerald-400" />,
    label: 'Build a deep-work set',
    prompt:
      'Build a 90-minute deep-work set from my library. Prefer instrumental, ambient and low-vocal tracks; create a playlist called Deep Work, then start playing it.',
  },
  {
    icon: <WavesIcon className="size-3.5 shrink-0 text-sky-400" />,
    label: 'Rainy late-night set',
    prompt:
      'Find tracks for a rainy late-night session, queue the best ones, and switch to the Rain room scene with the ambience sitting under the music.',
  },
  {
    icon: <TimerIcon className="size-3.5 shrink-0 text-amber-400" />,
    label: 'Score my next task',
    prompt:
      'Look at my open tasks, pick the most urgent one, choose a 50-minute focus soundtrack, start a focus session on that task, and play the music.',
  },
  {
    icon: <Volume2Icon className="size-3.5 shrink-0 text-violet-400" />,
    label: 'Soften the room',
    prompt:
      'Bring the music master down a little and lower the ambience further, but keep the current track playing.',
  },
];

export interface MusicCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
}

export function MusicCopilotSheet({
  open,
  onOpenChange,
  initialPrompt,
  onInitialPromptHandled,
}: MusicCopilotSheetProps) {
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useMusicCopilot();

  useEffect(() => {
    if (!open || !initialPrompt?.trim()) return;
    sendMessage(initialPrompt.trim());
    onInitialPromptHandled?.();
  }, [open, initialPrompt, sendMessage, onInitialPromptHandled]);

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center select-none">
      <div className="rounded-full border border-primary/30 bg-gradient-to-tr from-primary/20 to-sky-500/10 p-4">
        <SparklesIcon className="size-6 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Your listening concierge
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Reads your local library, builds coherent sets, runs the ambience, and
          can hand you into a focus session.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 pt-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => sendMessage(item.prompt)}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/30 p-2.5 text-left text-xs text-muted-foreground shadow-2xs transition-all hover:border-primary/50 hover:bg-secondary/60 hover:text-foreground"
          >
            {item.icon}
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium text-foreground">
                {item.label}
              </span>
              <span className="truncate text-[10px] text-muted-foreground/80">
                {item.prompt}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border/50 bg-card/95 p-0 backdrop-blur-md sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border/40 bg-card/80 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <SheetTitle className="flex items-center gap-2 text-xs font-semibold tracking-tight text-foreground">
                <SparklesIcon className="size-4 shrink-0 text-primary" />
                <span>Music Copilot</span>
              </SheetTitle>
              <Badge
                variant="outline"
                className="h-4 border-border/60 bg-background/50 px-1 font-mono text-[9px] font-normal text-muted-foreground"
              >
                DJ
              </Badge>
            </div>

            <div className="mr-6 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={clearMessages}
                title="New session / Clear"
                disabled={messages.length === 0}
              >
                <PlusIcon className="size-3.5" />
                <span className="sr-only">New session</span>
              </Button>
            </div>
          </div>
          <SheetDescription className="pt-0.5 text-[11px] text-muted-foreground">
            Curates from your library, runs playback and ambience, and can start
            a focus session.
          </SheetDescription>
        </SheetHeader>

        <Conversation className="flex-1 overflow-hidden">
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

        <div className="border-t border-border/40 bg-card/60 p-3">
          <PromptInput
            onSubmit={({ text }) => {
              const value = text.trim();
              if (value) sendMessage(value);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask the DJ for a set, a scene, or a focus soundtrack…"
                className="min-h-12 text-xs"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 cursor-pointer text-[11px] text-muted-foreground"
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
