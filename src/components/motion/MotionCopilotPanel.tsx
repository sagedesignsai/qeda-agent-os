/**
 * components/motion/MotionCopilotPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Motion Copilot Panel — an AI conversational interface for Motion editing.
 *
 * Sits inside the right-side resizable panel (tabbed with Inspector) and provides:
 *   - AI Elements Conversation & MessageList for streaming responses and tool cards
 *   - Motion-specific suggestions (camera push, keyframes, product spin, geometry)
 *   - Plan panel for multi-step agent plans
 *   - Prompt input with clear session button
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  SparklesIcon,
  PlusIcon,
  XIcon,
  CameraIcon,
  KeyIcon,
  BoxIcon,
  SparkleIcon,
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
import { MessageList } from '@/components/chat/MessageList';
import { PlanPanel } from '@/components/plan/PlanPanel';
import type { UIMessage } from 'ai';
import type { AgentPlan } from '@/lib/agent-plan';

const SUGGESTIONS = [
  {
    icon: <CameraIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
    label: 'Camera push animation',
    prompt:
      'Add a camera push animation to the active scene: slowly move the camera closer to the main subject over 3 seconds.',
  },
  {
    icon: <KeyIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Keyframe at playhead',
    prompt:
      'Create a keyframe at the current playhead position for all animated properties on selected nodes.',
  },
  {
    icon: <BoxIcon className="w-3.5 h-3.5 text-teal-400 shrink-0" />,
    label: 'Product spin scene',
    prompt:
      'Build a product spin scene: add a 360-degree rotation animation to the main product model over 5 seconds.',
  },
  {
    icon: <SparkleIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    label: 'Procedural geometry',
    prompt:
      'Generate procedural geometry for the scene: add a torus knot with animated rotation and subtle scale pulsing.',
  },
];

/* ── Props ─────────────────────────────────────────────────────────────── */

export interface MotionCopilotPanelProps {
  /** Chat messages */
  messages: UIMessage[];
  /** Current streaming status */
  status: 'ready' | 'streaming' | 'error';
  /** Error message */
  error: Error | undefined;
  /** Current plan (for multi-step agent plans) */
  plan: AgentPlan | null;
  /** Send a message to the copilot */
  sendMessage: (text: string) => void;
  /** Respond to an approval prompt */
  respondToApproval: (args: { approvalId: string; toolCallId: string; approved: boolean }) => void;
  /** Clear all messages and plan */
  clearMessages: () => void;
  /** Provider fallback notice */
  fallbackNotice: { fromProvider: string; toProvider: string; reason: string } | null | undefined;
  /** Dismiss the fallback notice */
  dismissFallbackNotice: () => void;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function MotionCopilotPanel({
  messages,
  status,
  error,
  plan,
  sendMessage,
  respondToApproval,
  clearMessages,
  fallbackNotice,
  dismissFallbackNotice,
}: MotionCopilotPanelProps) {
  const handleClear = () => {
    clearMessages();
  };

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center select-none">
      <div className="rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 p-4 border border-indigo-500/30">
        <SparklesIcon className="size-6 text-indigo-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Motion Copilot
        </h3>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          AI assistant for Motion editing: add nodes, set keyframes, create
          animations, and build scenes conversationally.
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
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 px-4 py-3 bg-card/80 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="flex items-center gap-2 text-xs font-semibold text-foreground tracking-tight">
              <SparklesIcon className="size-4 text-indigo-400 shrink-0" />
              <span>Motion Copilot</span>
            </h2>
          </div>

          <div className="flex items-center gap-1">
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

        <p className="text-[11px] text-muted-foreground pt-0.5">
          AI assistant for scene ops, keyframes, animation, and assets.
        </p>
      </div>

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
      <div className="border-t border-border/40 p-3 bg-card/60 shrink-0">
        <PromptInput
          onSubmit={({ text }) => {
            const value = text.trim();
            if (value) sendMessage(value);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask Copilot to add nodes, set keyframes, or create animations..."
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
    </div>
  );
}
