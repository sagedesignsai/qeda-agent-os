/**
 * components/model-builder/ModelBuilderDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Builder Dialog — a modal with an AI copilot sidebar and live 3D
 * viewport. The user describes a 3D model in natural language, the AI agent
 * builds it step-by-step, and the 3D scene renders the model in real-time.
 *
 * Layout: Dialog → header + flex row → viewport (1fr) + copilot aside (fixed
 * width). The document is ephemeral — created on open, optionally saved on
 * close. NOTE: no nested SidebarProvider here (shadcn SidebarProvider/Sidebar
 * use min-h-svh + fixed positioning, which overflows any modal container —
 * the SidebarHeader/Content/Footer primitives alone are provider-free).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BoxIcon,
  Grid3X3Icon,
  SaveIcon,
  SparklesIcon,
  SparkleIcon,
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
import { MessageList } from '@/components/chat/MessageList';
import { PlanPanel } from '@/components/plan/PlanPanel';
import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SidebarContent, SidebarFooter } from '@/components/ui/sidebar';
import { useIpcEvent } from '@/hooks/use-ipc';
import { useModelBuilder } from '@/hooks/use-model-builder';
import { createBlankMotionDocument } from '@/lib/motion/defaults';
import type { MotionDocument } from '@/lib/motion/types';
import { PlaybackClock } from '@/lib/timeline/clock';

const SUGGESTIONS = [
  {
    icon: <BoxIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
    label: 'Minimalist chair',
    prompt: 'Create a modern minimalist chair with wooden legs',
  },
  {
    icon: <SparklesIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Mountain landscape',
    prompt: 'Build a low-poly mountain landscape with a lake',
  },
  {
    icon: <BoxIcon className="w-3.5 h-3.5 text-teal-400 shrink-0" />,
    label: 'Spaceship cockpit',
    prompt: 'Design a futuristic spaceship cockpit interior',
  },
  {
    icon: <SparkleIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    label: 'Coffee cup with steam',
    prompt: 'Make a detailed coffee cup with steam particles',
  },
];

export interface ModelBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user chooses to save the created model. */
  onSave?: (document: MotionDocument) => void;
  /** Real project the dialog was opened from, for GLB asset staging. */
  projectId?: string;
}

export function ModelBuilderDialog({
  open,
  onOpenChange,
  onSave,
  projectId,
}: ModelBuilderDialogProps) {
  // Ephemeral document — created fresh each time the dialog opens.
  // Blank (not starter): camera + lights + ground are present, but no product
  // content competes with the user's model.
  const [document, setDocument] = useState<MotionDocument>(() =>
    createBlankMotionDocument({
      id: `model-builder-${Date.now()}`,
      name: 'Model Builder',
    }),
  );

  // Reset document and messages when dialog opens
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages: rawClearMessages,
    plan,
    clearPlan,
  } = useModelBuilder({ document, projectId });

  const clearMessages = useCallback(() => {
    clearPlan();
    rawClearMessages();
  }, [clearPlan, rawClearMessages]);

  useEffect(() => {
    if (open) {
      setDocument(
        createBlankMotionDocument({
          id: `model-builder-${Date.now()}`,
          name: 'Model Builder',
        }),
      );
      clearMessages();
    }
  }, [open, clearMessages]);

  // Receive updated document from the agent after each turn
  useIpcEvent('model-builder:doc-updated', (raw: unknown) => {
    const payload = raw as { document: MotionDocument };
    if (payload?.document) {
      setDocument(payload.document);
    }
  });

  // Playback clock for the 3D viewport (paused — static preview)
  const clock = useMemo(
    () =>
      new PlaybackClock({
        duration: () => document.timeline.duration,
        playMode: () => 'once',
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Viewport settings
  const [gridVisible, setGridVisible] = useState(true);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(() => {
    onSave?.(document);
    onOpenChange(false);
  }, [document, onSave, onOpenChange]);

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center select-none">
      <div className="rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 p-4 border border-indigo-500/30">
        <SparklesIcon className="size-6 text-indigo-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Model Builder
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Describe a 3D model and watch it come to life. Iterate
          conversationally to refine the design.
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[95vw]"
      >
        <DialogHeader className="border-b border-border/60 px-4 py-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SparklesIcon className="size-4 text-amber-500" />
              Model Builder
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={handleSave}
                title="Save to Motion"
              >
                <SaveIcon className="size-3.5" />
                <span className="sr-only">Save to Motion</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={handleClose}
                title="Close"
              >
                <XIcon className="size-3.5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* 3D Viewport */}
          <div className="relative min-w-0 flex-1 overflow-hidden bg-background">
            {/* Viewport toolbar */}
            <div className="absolute right-3 top-3 z-10 flex items-center rounded-lg border border-border/60 bg-popover/80 p-1 backdrop-blur-xs">
              <Button
                variant="ghost"
                size="icon-sm"
                className={`size-7 ${gridVisible ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                onClick={() => setGridVisible((v) => !v)}
                title="Toggle grid"
              >
                <Grid3X3Icon className="size-3.5" />
              </Button>
            </div>

            <div className="h-full w-full">
              <MotionSceneCanvas
                doc={document}
                clock={clock}
                viewMode="perspective"
                stageColor="hsl(var(--background))"
                gridVisible={gridVisible}
                zoom={1}
                showEditorStage
              />
            </div>
          </div>

          {/* Copilot Sidebar */}
          <aside className="flex w-80 min-w-80 shrink-0 flex-col border-l border-l-border/60">
            <SidebarContent className="p-0">
              <Conversation className="h-full">
                <ConversationContent
                  className={plan ? 'p-0 pb-28' : 'p-0 pb-6'}
                >
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
                    <PlanPanel
                      plan={plan}
                      isRunning={status === 'streaming'}
                    />
                  </div>
                )}
              </Conversation>
            </SidebarContent>

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

            <SidebarFooter className="border-t border-border/40 p-3 bg-card/60">
              <PromptInput
                onSubmit={({ text }) => {
                  const value = text.trim();
                  if (value) sendMessage(value);
                }}
              >
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder="Describe the 3D model you want to build…"
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
            </SidebarFooter>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
