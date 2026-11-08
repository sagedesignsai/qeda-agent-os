/**
 * components/trace/copilot/TraceCopilotSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The NovaTrace Copilot Sheet — an autonomous AI motion designer.
 *
 * Provides a dedicated sliding Sheet overlay (right side, sm:max-w-lg) with:
 *   - AI Elements Conversation & MessageList rendering streaming responses and tool cards
 *   - Autonomous tool execution (create elements, animate tracks, apply recipes, export)
 *   - Quick-action suggestion chips for common motion graphics patterns
 *   - Real-time canvas refresh via trace:changed broadcast
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import {
  SparklesIcon,
  PlusIcon,
  XIcon,
  Wand2Icon,
  TypeIcon,
  FilmIcon,
  LayoutIcon,
  BarChart3Icon,
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
import { useTraceCopilot } from '@/hooks/use-trace-copilot';
import { useIpcEvent } from '@/hooks/use-ipc';
import { useTraceStore } from '@/stores/trace-store';

const SUGGESTIONS = [
  {
    icon: <Wand2Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
    label: 'Logo Stinger',
    prompt:
      'Generate a full-frame Logo Stinger / Sponsor Card template. The background should be dark slate with ambient light-glow accents along the screen edges. Center the main SVG logo graphic. Below the logo, add a two-column feature list block with bullet icons and light subtext. Animate the logo with a scale-up reveal from 90% to 100% (0.5s duration), followed by a 0.2s staggered fade-in for each sub-text bullet. Make it beautiful, professional and well designed.',
  },
  {
    icon: <FilmIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Lower Third',
    prompt:
      'Create a cinematic lower third card with a semi-transparent dark background, an animated accent bar that grows from 0 to full height, a title that slides in from the left, and a subtitle that fades in after. Use professional broadcast styling.',
  },
  {
    icon: <TypeIcon className="w-3.5 h-3.5 text-teal-400 shrink-0" />,
    label: 'Kinetic Headline',
    prompt:
      'Create a kinetic typography headline that animates word by word with a staggered slide-up and fade-in effect. The text should read "MOVE THE STORY" in large bold type. Include an accent rule that draws on beneath the headline and a subhead that fades in after.',
  },
  {
    icon: <BarChart3Icon className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    label: 'Metrics Infographic',
    prompt:
      'Create a key metrics infographic with a KPI counter that animates from 0 to $428K, a progress ring that draws on to 86%, and a bar chart with 4 quarterly bars that grow from 0 to their values. Use a dark background with a section label.',
  },
];

export interface TraceCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  traceProjectId?: string;
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
  onChanged?: () => void;
}

export function TraceCopilotSheet({
  open,
  onOpenChange,
  traceProjectId,
  initialPrompt,
  onInitialPromptHandled,
  onChanged,
}: TraceCopilotSheetProps) {
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
  } = useTraceCopilot({ traceProjectId });

  const handleClear = () => {
    clearPlan();
    clearMessages();
  };

  // Automatically dispatch when opened with an initial prompt
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      sendMessage(initialPrompt.trim());
      onInitialPromptHandled?.();
    }
  }, [open, initialPrompt, sendMessage, onInitialPromptHandled]);

  // Refresh canvas/timeline on changes
  useIpcEvent('trace:changed', () => onChanged?.());

  const projectName = useTraceStore((s) => s.project?.name ?? 'Trace');

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center select-none">
      <div className="rounded-full bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 p-4 border border-cyan-500/30">
        <LayoutIcon className="size-6 text-cyan-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          NovaTrace AI Motion Designer
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Autonomous motion graphics: logo stingers, lower thirds, kinetic
          typography, data visualizations, and broadcast overlays.
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
                <SparklesIcon className="size-4 text-cyan-400 shrink-0" />
                <span>Trace Copilot</span>
              </SheetTitle>
              <Badge
                variant="outline"
                className="h-4 text-[9px] font-mono px-1 font-normal bg-background/50 border-border/60 text-muted-foreground truncate"
              >
                {projectName}
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
            Autonomous motion designer over elements, tracks, recipes, and
            exports.
          </SheetDescription>

          <ActiveProjectNotice className="mt-1.5" compact />
        </SheetHeader>

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
              <PlanPanel plan={plan} />
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
                placeholder="Ask Copilot to create a composition, animate elements, or apply a recipe..."
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
