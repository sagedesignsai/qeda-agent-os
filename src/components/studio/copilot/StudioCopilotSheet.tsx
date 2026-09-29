/**
 * components/studio/copilot/StudioCopilotSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Studio Copilot Sheet — an autonomous conversational video editor.
 *
 * Provides a dedicated sliding Sheet overlay (right side, sm:max-w-lg) with:
 *   - AI Elements Conversation & MessageList rendering streaming responses and tool cards
 *   - Autonomous tool execution (zooms, dead-air cuts, subtitles, framing, release kit)
 *   - Quick-action suggestion chips for video directing
 *   - Smart bridge integration with Inspector action buttons
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from 'react';
import {
  SparklesIcon,
  PlusIcon,
  XIcon,
  Wand2Icon,
  FilmIcon,
  Share2Icon,
  TypeIcon,
  VideoIcon,
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
import { ActiveProjectNotice } from '@/components/projects/ActiveProjectNotice';
import { useStudioCopilot } from '@/hooks/use-studio-copilot';
import { useIpcEvent } from '@/hooks/use-ipc';
import type { StudioTake } from '@/lib/studio-types';

const SUGGESTIONS = [
  {
    icon: <Wand2Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
    label: 'Run Magic Draft',
    prompt:
      'Run a complete Magic Draft on this take: prune dead air pauses, calculate kinetic zooms from mouse dwell points, and polish canvas styling.',
  },
  {
    icon: <FilmIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Zoom at Playhead',
    prompt:
      'Add a kinetic zoom keyframe focused at the current playhead position to highlight this action.',
  },
  {
    icon: <TypeIcon className="w-3.5 h-3.5 text-teal-400 shrink-0" />,
    label: 'Generate Subtitles',
    prompt:
      'Generate punchy, timed subtitles for this walkthrough with clear phrasing.',
  },
  {
    icon: <Share2Icon className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    label: 'Draft Release Kit',
    prompt:
      'Draft an AI Social Release Kit for this take: viral X/Twitter thread, GitHub changelog markdown, and LinkedIn announcement.',
  },
];

export interface StudioCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTake: StudioTake;
  currentTimeMs?: number;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
  onChanged?: () => void;
}

export function StudioCopilotSheet({
  open,
  onOpenChange,
  activeTake,
  currentTimeMs = 0,
  initialPrompt,
  onInitialPromptHandled,
  onChanged,
}: StudioCopilotSheetProps) {
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useStudioCopilot({
    takeId: activeTake.id,
    projectId: activeTake.projectId ?? undefined,
    currentTimeMs,
  });

  // Automatically dispatch when opened with an initial prompt (e.g. from Inspector buttons)
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      sendMessage(initialPrompt.trim());
      onInitialPromptHandled?.();
    }
  }, [open, initialPrompt, sendMessage, onInitialPromptHandled]);

  // Refresh take/timeline on changes
  useIpcEvent('studio:changed', () => onChanged?.());

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center select-none">
      <div className="rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 p-4 border border-indigo-500/30">
        <VideoIcon className="size-6 text-indigo-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Studio AI Video Director
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Autonomous video editing partner: synthesize kinetic zooms, prune
          silence, generate subtitles, and style canvas framing.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 pt-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => sendMessage(item.prompt)}
            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/30 p-2.5 text-left text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-secondary/60 hover:text-foreground cursor-pointer shadow-2xs"
          >
            {item.icon}
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-foreground text-[11px]">
                {item.label}
              </span>
              <span className="text-[10px] text-muted-foreground/80 truncate">
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
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg bg-card/95 backdrop-blur-md border-l border-border/50"
      >
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <SheetHeader className="border-b border-border/40 px-4 py-3 bg-card/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <SheetTitle className="flex items-center gap-2 text-xs font-semibold text-foreground tracking-tight">
                <SparklesIcon className="size-4 text-indigo-400 shrink-0" />
                <span>Studio Copilot</span>
              </SheetTitle>
              <Badge
                variant="outline"
                className="h-4 text-[9px] font-mono px-1 font-normal bg-background/50 border-border/60 text-muted-foreground truncate"
              >
                {activeTake.title}
              </Badge>
            </div>

            <div className="mr-6 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={clearMessages}
                title="New session / Clear"
                disabled={messages.length === 0}
              >
                <PlusIcon className="size-3.5" />
                <span className="sr-only">New session</span>
              </Button>
            </div>
          </div>

          <SheetDescription className="text-[11px] text-muted-foreground pt-0.5">
            Autonomous video director over timeline cuts, zooms, subtitles, and
            release kits.
          </SheetDescription>

          <ActiveProjectNotice className="mt-1.5" />
        </SheetHeader>

        {/* ── Conversation Stream ─────────────────────────────────────────────── */}
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

        {/* ── Model Fallback Notice ───────────────────────────────────────────── */}
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

        {/* ── Prompt Input Footer ─────────────────────────────────────────────── */}
        <div className="border-t border-border/40 p-3 bg-card/60">
          <PromptInput
            onSubmit={({ text }) => {
              const value = text.trim();
              if (value) sendMessage(value);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask Copilot to zoom, cut silence, subtitle, or style..."
                className="text-xs min-h-12"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground cursor-pointer"
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
