/**
 * components/studio/copilot/StudioCopilotPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Studio Copilot panel — an autonomous conversational video editor.
 *
 * Provides a docked right-side panel with:
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
  LayersIcon,
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
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageList } from '@/components/chat/MessageList';
import { PlanPanel } from '@/components/plan/PlanPanel';
import { ActiveProjectNotice } from '@/components/projects/ActiveProjectNotice';
import {
  useStudioCopilot,
  type StudioCopilotMode,
} from '@/hooks/use-studio-copilot';
import { useIpcEvent, useIpcInvoke } from '@/hooks/use-ipc';
import type { StudioTake } from '@/lib/studio-types';
import type {
  StudioSignInDecision,
  StudioSignInRequest,
} from '@/lib/studio/types';

const SHOWCASE_SUGGESTIONS = [
  {
    icon: <LayersIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
    label: 'Build Showcase',
    prompt:
      'Build a polished multi-track showcase from this recording: inspect the project, import the source, create video and audio lanes, place clips, and add captions.',
  },
  {
    icon: <Wand2Icon className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Add Captions & Effects',
    prompt:
      'Add timed captions and a clip-attached spotlight effect with an animated intensity keyframe to the main video clip.',
  },
  {
    icon: <FilmIcon className="w-3.5 h-3.5 text-teal-400 shrink-0" />,
    label: 'Cut Vertical Teaser',
    prompt:
      'Create a 9:16 vertical teaser from this recording with the key moment in the middle, bold captions, and a vignette.',
  },
];

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

export interface StudioCopilotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTake: StudioTake;
  projectId?: string;
  currentTimeMs?: number;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
}

export function StudioCopilotPanel({
  open,
  onOpenChange,
  activeTake,
  projectId,
  currentTimeMs = 0,
  initialPrompt,
  onInitialPromptHandled,
}: StudioCopilotPanelProps) {
  const [mode, setMode] = useState<StudioCopilotMode>('edit');
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
    mode,
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

  const handleModeChange = (nextMode: StudioCopilotMode) => {
    if (nextMode === mode) return;
    // The active plan belongs to the previous workflow; keep the transcript,
    // but do not show stale steps beside the new mode.
    clearPlan();
    setMode(nextMode);
  };

  const suggestions = mode === 'showcase' ? SHOWCASE_SUGGESTIONS : SUGGESTIONS;

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
          {mode === 'showcase' ? 'Showcase Builder' : 'Studio AI Video Director'}
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {mode === 'showcase'
            ? 'Build a multi-track showcase from your media pool: arrange clips, attach effects, and time captions on their own lanes.'
            : 'Autonomous video editing partner: synthesize kinetic zooms, prune silence, generate subtitles, and style canvas framing.'}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 pt-2">
        {suggestions.map((item) => (
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
    <aside
      aria-label="Studio Copilot"
      aria-hidden={!open}
      inert={!open}
      className={`h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
        open ? 'w-[clamp(320px,35vw,420px)]' : 'w-0'
      }`}
    >
      <div className="flex h-full w-[clamp(320px,35vw,420px)] flex-col border-l border-border/60 bg-card/95 shadow-2xl backdrop-blur-md">
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="flex h-9 shrink-0 items-center justify-between border-b border-border/40 bg-card/80 px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-tight text-foreground">
                <SparklesIcon className="size-4 text-indigo-400 shrink-0" />
                <span>Studio Copilot</span>
              </h2>
              <Badge
                variant="outline"
                className="h-4 text-[9px] font-mono px-1 font-normal bg-background/50 border-border/60 text-muted-foreground truncate"
              >
                {activeTake.title}
              </Badge>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Close Studio Copilot"
              onClick={() => handleOpenChange(false)}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </header>

        <div className="shrink-0 border-b border-border/40 px-3 py-1">
          <ActiveProjectNotice
            className="rounded-none border-0 bg-transparent px-0 py-0 text-[10px]"
            compact
          />
        </div>

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
        <Conversation className="min-h-0 flex-1 overflow-hidden">
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
                placeholder={
                  mode === 'showcase'
                    ? 'Ask Copilot to build tracks, arrange clips, or add effects...'
                    : 'Ask Copilot to zoom, cut silence, subtitle, or style...'
                }
                className="text-xs min-h-12"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputSelect
                  value={mode}
                  onValueChange={(nextMode) => {
                    if (nextMode === 'edit' || nextMode === 'showcase') {
                      handleModeChange(nextMode);
                    }
                  }}
                >
                  <PromptInputSelectTrigger
                    aria-label="Copilot mode"
                    className="h-7 w-[112px] justify-between px-2 text-[10px]"
                  >
                    <PromptInputSelectValue />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    <PromptInputSelectItem value="edit">
                      Edit
                    </PromptInputSelectItem>
                    <PromptInputSelectItem value="showcase">
                      Showcase
                    </PromptInputSelectItem>
                  </PromptInputSelectContent>
                </PromptInputSelect>
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
      </div>
    </aside>
  );
}
