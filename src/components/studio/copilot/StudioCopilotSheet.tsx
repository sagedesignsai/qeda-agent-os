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

import React, { useEffect, useState } from 'react';
import {
  SparklesIcon,
  PlusIcon,
  XIcon,
  Wand2Icon,
  FilmIcon,
  Share2Icon,
  TypeIcon,
  VideoIcon,
  ShieldCheckIcon,
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
import { PlanPanel } from '@/components/plan/PlanPanel';
import { ActiveProjectNotice } from '@/components/projects/ActiveProjectNotice';
import { useStudioCopilot } from '@/hooks/use-studio-copilot';
import { useIpcEvent, useIpcInvoke } from '@/hooks/use-ipc';
import type { StudioTake } from '@/lib/studio-types';
import type {
  StudioSignInDecision,
  StudioSignInRequest,
} from '@/lib/studio/types';

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
  projectId?: string;
  currentTimeMs?: number;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
}

export function StudioCopilotSheet({
  open,
  onOpenChange,
  activeTake,
  projectId,
  currentTimeMs = 0,
  initialPrompt,
  onInitialPromptHandled,
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
    plan,
    clearPlan,
  } = useStudioCopilot({
    takeId: activeTake.id,
    projectId: activeTake.projectId ?? projectId,
    currentTimeMs,
  });
  const ipcInvoke = useIpcInvoke();
  const [signInRequest, setSignInRequest] =
    useState<StudioSignInRequest | null>(null);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const [replyingToSignIn, setReplyingToSignIn] = useState(false);

  useIpcEvent(
    'studio-copilot:sign-in-request',
    (payload) => {
      const request = payload as StudioSignInRequest;
      if (!open) {
        void ipcInvoke('studio-copilot:sign-in-reply', {
          requestId: request.requestId,
          decision: 'cancel',
        }).catch((error: unknown) => {
          setSignInNotice(
            error instanceof Error
              ? error.message
              : 'Could not cancel the sign-in request.',
          );
        });
        return;
      }
      setSignInNotice(null);
      setSignInRequest(request);
    },
    [open, ipcInvoke],
  );

  useIpcEvent(
    'studio-copilot:sign-in-expired',
    (payload) => {
      const { requestId } = payload as { requestId: string };
      if (signInRequest?.requestId === requestId) {
        setSignInRequest(null);
        setSignInNotice('Sign-in timed out. Ask Copilot to try again.');
      }
    },
    [signInRequest],
  );

  const respondToSignIn = async (decision: StudioSignInDecision) => {
    if (!signInRequest) return;
    const requestId = signInRequest.requestId;
    setReplyingToSignIn(true);
    setSignInNotice(null);
    try {
      const result = await ipcInvoke<{ accepted: boolean }>(
        'studio-copilot:sign-in-reply',
        { requestId, decision },
      );
      if (!result.accepted) {
        throw new Error('This sign-in request is no longer active.');
      }
      setSignInRequest((current) =>
        current?.requestId === requestId ? null : current,
      );
    } catch (error) {
      setSignInNotice(
        error instanceof Error
          ? error.message
          : 'Could not submit the sign-in confirmation.',
      );
    } finally {
      setReplyingToSignIn(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && signInRequest) {
      void respondToSignIn('cancel');
    }
    onOpenChange(nextOpen);
  };

  const handleClear = () => {
    clearPlan();
    clearMessages();
  };

  // Automatically dispatch when opened with an initial prompt (e.g. from Inspector buttons)
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      sendMessage(initialPrompt.trim());
      onInitialPromptHandled?.();
    }
  }, [open, initialPrompt, sendMessage, onInitialPromptHandled]);

  // Take/timeline refresh is centralized in useStudio, which owns the active
  // take. A second listener here raced it and could reload the previous take.

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
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
                onClick={handleClear}
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

          <ActiveProjectNotice
            className="mt-1.5"
            compact
          />
        </SheetHeader>

        {signInRequest && (
          <div
            role="alert"
            aria-label="Sign-in confirmation"
            className="mx-3 mt-3 rounded-lg border border-amber-500/35 bg-amber-500/8 p-3"
          >
            <div className="flex items-start gap-2.5">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  Sign in before recording
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Finish login or MFA in the focused browser window. Keep
                  credentials in the browser, not in chat. Recording stays
                  stopped until you confirm.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={replyingToSignIn}
                onClick={() => void respondToSignIn('cancel')}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-[11px]"
                disabled={replyingToSignIn}
                onClick={() => void respondToSignIn('continue')}
              >
                I’m signed in
              </Button>
            </div>
          </div>
        )}
        {signInNotice && (
          <p
            role="status"
            className="mx-3 mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
          >
            {signInNotice}
          </p>
        )}

        {/* ── Conversation Stream ─────────────────────────────────────────────── */}
        <Conversation className="flex-1 overflow-hidden">
          <ConversationContent className="p-0 pb-20">
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
            <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-1 bg-card/80 backdrop-blur-xs">
              <PlanPanel plan={plan} compact />
            </div>
          )}
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
                  onClick={handleClear}
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
