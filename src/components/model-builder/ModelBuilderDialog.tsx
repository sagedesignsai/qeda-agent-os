/**
 * components/model-builder/ModelBuilderDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Builder Dialog — a modal with Sidebar-based AI copilot and live 3D
 * viewport. The user describes a 3D model in natural language, the AI agent
 * builds it step-by-step, and the 3D scene renders the model in real-time.
 *
 * Layout: Dialog → SidebarProvider → SidebarInset (3D viewport) + Sidebar
 * (copilot chat). The document is ephemeral — created on open, optionally
 * saved on close.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BotIcon,
  BoxIcon,
  Grid3X3Icon,
  PlusIcon,
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
import type { MotionCameraView } from '@/components/motion/scene/MotionSceneCanvas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIpcEvent } from '@/hooks/use-ipc';
import { useModelBuilder } from '@/hooks/use-model-builder';
import { createEmptyMotionDocument } from '@/lib/motion/defaults';
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
}

export function ModelBuilderDialog({
  open,
  onOpenChange,
  onSave,
}: ModelBuilderDialogProps) {
  // Ephemeral document — created fresh each time the dialog opens
  const [document, setDocument] = useState<MotionDocument>(() =>
    createEmptyMotionDocument({
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
  } = useModelBuilder({ document });

  const clearMessages = useCallback(() => {
    clearPlan();
    rawClearMessages();
  }, [clearPlan, rawClearMessages]);

  useEffect(() => {
    if (open) {
      setDocument(
        createEmptyMotionDocument({
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
  const [viewMode, setViewMode] = useState<MotionCameraView>('perspective');
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
        className="h-[90vh] w-[95vw] max-w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-[95vw]"
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

        <div className="flex h-[calc(90vh-48px)]">
          <SidebarProvider open defaultOpen>
            {/* 3D Viewport */}
            <SidebarInset className="relative overflow-hidden bg-background p-0">
              {/* Viewport toolbar */}
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border/60 bg-popover/80 p-1 backdrop-blur-xs">
                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(val) =>
                    val && setViewMode(val as MotionCameraView)
                  }
                >
                  <ToggleGroupItem
                    value="perspective"
                    className="h-7 w-7 px-0 text-xs"
                    title="Perspective"
                  >
                    <BoxIcon className="size-3.5" />
                  </ToggleGroupItem>
                </ToggleGroup>
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
                  viewMode={viewMode}
                  stageColor="hsl(var(--background))"
                  gridVisible={gridVisible}
                  zoom={1}
                  showEditorStage
                />
              </div>
            </SidebarInset>

            {/* Copilot Sidebar */}
            <Sidebar className="w-80 min-w-80 border-l border-l-border/60">
              <SidebarHeader className="border-b border-border/40 px-3 py-2.5 bg-card/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="flex items-center gap-2 text-xs font-semibold text-foreground tracking-tight">
                      <BotIcon className="size-4 text-indigo-400 shrink-0" />
                      <span>AI Assistant</span>
                    </h2>
                  </div>
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
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  AI assistant for 3D model creation: geometry, materials, and
                  scene composition.
                </p>
              </SidebarHeader>

              <SidebarContent className="p-0">
                <Conversation className="h-full">
                  <ConversationContent className="p-0">
                    {plan && (
                      <div className="sticky top-0 z-20 px-3 pt-3 pb-1 bg-card/80 backdrop-blur-xs">
                        <PlanPanel
                          plan={plan}
                          isRunning={status === 'streaming'}
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
            </Sidebar>
          </SidebarProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
