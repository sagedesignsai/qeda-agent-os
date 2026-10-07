/**
 * components/soundlab/copilot/SoundLabCopilotSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The SoundLab Copilot Sheet — an autonomous neuro-acoustic producer assistant.
 *
 * Provides a sliding Sheet overlay (right side, sm:max-w-lg) with:
 *   - AI Elements Conversation & MessageList rendering streaming responses and tool cards
 *   - Quick-action suggestion chips for common soundscape workflows
 *   - Automatic DAW refresh via 'soundlab:changed' IPC event
 *   - Provider fallback notice when the active model is unavailable
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from 'react';
import {
  SparklesIcon,
  PlusIcon,
  XIcon,
  BrainIcon,
  Music2Icon,
  WavesIcon,
  DrumIcon,
  SlidersHorizontalIcon,
  ZapIcon,
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
import { useSoundLabCopilot } from '@/hooks/use-soundlab-copilot';
import { useIpcEvent } from '@/hooks/use-ipc';
import type { SoundLabSession } from '@/lib/soundlab-types';
import { BRAINWAVE_BAND_META } from '@/lib/soundlab-types';

// ─── Quick-action suggestion chips ───────────────────────────────────────────

const SUGGESTIONS = [
  {
    icon: <BrainIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
    label: 'Optimize for Deep Focus',
    prompt:
      'Tune this session for deep focus: set Alpha entrainment at 10 Hz with a 432 Hz carrier in binaural mode. Add a gentle volume fade-in automation over the first 8 beats.',
  },
  {
    icon: <Music2Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
    label: 'Compose Ambient Melody',
    prompt:
      'Compose a sparse ambient chord pad in the current session key. Use long notes (4–8 beats), triads and 7th chords, velocity around 0.65.',
  },
  {
    icon: <DrumIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    label: 'Add Chill Lo-Fi Beat',
    prompt:
      'Program a chill lo-fi drum pattern: kick on beat 1 and 3, snare on 2 and 4, scattered hi-hats, no clap. Write it into the drums track.',
  },
  {
    icon: <WavesIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Add Reverb & Delay Wash',
    prompt:
      'Apply a deep reverb (wet 0.7, decay 4 s) and shimmer delay (350 ms, feedback 0.3, wet 0.25) to the ambient pad track.',
  },
  {
    icon: <SlidersHorizontalIcon className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
    label: 'Arrange Full Timeline',
    prompt:
      'Arrange the current session into a full 64-beat structure: pad from beat 0, drums enter at beat 8, entrainment always on. Create clips for every active track.',
  },
  {
    icon: <ZapIcon className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
    label: 'Peak Gamma Session',
    prompt:
      'Rebuild this session for peak cognitive performance: 128 BPM, 40 Hz Gamma AM-embed entrainment at 40 Hz carrier, driving 808 drum pattern, bright chord progression.',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SoundLabCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSession: SoundLabSession;
  currentBeat?: number;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
  onChanged?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SoundLabCopilotSheet({
  open,
  onOpenChange,
  activeSession,
  currentBeat = 0,
  initialPrompt,
  onInitialPromptHandled,
  onChanged,
}: SoundLabCopilotSheetProps) {
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useSoundLabCopilot({
    sessionId: activeSession.id,
    currentBeat,
  });

  // Fire an initial prompt when the sheet is opened from an action button
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      sendMessage(initialPrompt.trim());
      onInitialPromptHandled?.();
    }
  }, [open, initialPrompt, sendMessage, onInitialPromptHandled]);

  // Refresh DAW on any agent mutation
  useIpcEvent('soundlab:changed', () => onChanged?.());

  const bandMeta = BRAINWAVE_BAND_META[activeSession.targetBand];

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center select-none">
      <div className="rounded-full bg-gradient-to-tr from-violet-500/20 to-cyan-500/20 p-4 border border-violet-500/30">
        <BrainIcon className="size-6 text-violet-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          SoundLab AI Producer
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Autonomous neuro-acoustic composer: tune entrainment, compose
          melodies, program drums, arrange the timeline, and mix effects.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 pt-1">
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
                <SparklesIcon className="size-4 text-violet-400 shrink-0" />
                <span>SoundLab Copilot</span>
              </SheetTitle>
              <Badge
                variant="outline"
                className="h-4 text-[9px] font-mono px-1 font-normal bg-background/50 border-border/60 text-muted-foreground truncate max-w-[120px]"
              >
                {activeSession.title}
              </Badge>
              <Badge
                variant="outline"
                className="h-4 text-[9px] px-1.5 font-normal border-border/60 shrink-0"
                style={{ color: bandMeta.color, borderColor: `${bandMeta.color}40` }}
              >
                {bandMeta.label} {bandMeta.hz} Hz
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
            Autonomous AI producer: compose melodies, tune entrainment, program
            drums, arrange timeline, and mix effects.
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
                placeholder="Ask Copilot to compose, tune entrainment, program drums, arrange timeline..."
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
