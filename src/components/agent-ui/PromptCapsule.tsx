/**
 * components/agent-ui/PromptCapsule.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The one way an agent surface renders the user's own prompt: a full-width,
 * capped-height capsule whose copy/retry affordances stay hidden until hover,
 * so a long prompt never pushes the agent's answer down the panel.
 *
 * WHY THIS IS SHARED
 * ──────────────────
 * Lifted verbatim out of `components/chat/MessageList.tsx`, which was the only
 * thing that used it. Chat and the Tasks/Studio/SoundLab copilots all render
 * turns through MessageList, but the Builder composes its own feed from the
 * OpenCode event stream and had grown a second, different prompt treatment
 * (a right-aligned primary-tinted bubble with a "YOU" label). Two prompt
 * capsules for the same idea made agent turns look like different products
 * depending on which page you were on.
 *
 * This component owns *presentation only*. It deliberately does not know what a
 * prompt is for, which surface it is in, or whether retry is possible — so it
 * can serve an AI SDK turn and an OpenCode turn alike without either one
 * special-casing the other.
 *
 * The JSX is unchanged from MessageList's copy, including its `text-[10px]`
 * timestamp, so Chat's rendering is byte-identical to before the extraction.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { CheckIcon, CopyIcon, RotateCcwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface PromptCapsuleProps {
  text: string;
  /**
   * Epoch ms of the prompt. When omitted the timestamp falls back to render
   * time — pass the real value if you have it, or a missing timestamp will
   * quietly show "now" for a prompt sent minutes ago.
   */
  createdAt?: number;
  /** Omitted on surfaces that cannot re-run a turn; hides the retry button. */
  onRetry?: (text: string) => void;
}

export function PromptCapsule({
  text,
  createdAt,
  onRetry,
}: PromptCapsuleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const timeString = createdAt
    ? format(new Date(createdAt), 'h:mm')
    : format(new Date(), 'h:mm');

  return (
    <div className="group relative flex w-full items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2.5 transition-colors hover:border-border/80 hover:bg-muted/30">
      {/* Capped-height scrollable prompt text so agent responses are prioritized */}
      <div className="max-h-24 min-h-0 flex-1 overflow-y-auto text-xs leading-relaxed text-foreground/90 select-text">
        <p className="whitespace-pre-wrap font-normal">{text}</p>
      </div>

      {/* Hover-revealed timestamp and action buttons */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <span className="mr-0.5 text-[10px] tabular-nums text-muted-foreground/60 select-none">
          {timeString}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          title="Copy prompt"
        >
          {copied ? (
            <CheckIcon className="size-3 text-emerald-500" />
          ) : (
            <CopyIcon className="size-3" />
          )}
          <span className="sr-only">Copy prompt</span>
        </Button>
        {onRetry && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={() => onRetry(text)}
            title="Retry / edit prompt"
          >
            <RotateCcwIcon className="size-3" />
            <span className="sr-only">Retry prompt</span>
          </Button>
        )}
      </div>
    </div>
  );
}