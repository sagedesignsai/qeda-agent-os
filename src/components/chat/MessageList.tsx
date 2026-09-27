/**
 * components/chat/MessageList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the list of UIMessages using an agent-first, dense, minimalist layout:
 *   • User prompts: full-width, capped-height capsules with hover copy & retry actions
 *   • Reasoning: compact single-line "Worked on reasoning ❯" accordions
 *   • Tool calls: ultra-dense status pills with natural-language labels
 *   • Tool approvals: human-in-the-loop interactive confirmation cards
 *   • Assistant output: unboxed, high-density markdown documents
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, type ReactNode } from 'react';
import type { UIMessage } from 'ai';
import { format } from 'date-fns';
import {
  AlertCircleIcon,
  BrainIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  RotateCcwIcon,
  XIcon,
} from 'lucide-react';

import { MessageResponse } from '@/components/ai-elements/message';
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
  type ConfirmationProps,
} from '@/components/ai-elements/confirmation';
import { ToolCard } from './ToolCard';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Normalised view of a `tool-*` UI part. */
interface ToolPartView {
  toolCallId: string;
  toolName?: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  approval?: ConfirmationProps['approval'];
}

export interface MessageListProps {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'error';
  error: Error | undefined;
  onApproval: (args: {
    approvalId: string;
    toolCallId: string;
    approved: boolean;
  }) => void;
  /** Replaces the default empty state (used by the focus copilot). */
  emptyState?: ReactNode;
  /** Callback to retry or re-populate a prompt. */
  onRetry?: (text: string) => void;
}

/** Capped-height user prompt capsule with hover-revealed copy and retry actions. */
function UserPromptCapsule({
  text,
  createdAt,
  onRetry,
}: {
  text: string;
  createdAt?: number;
  onRetry?: (text: string) => void;
}) {
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

/** Compact single-line collapsible thinking block for model reasoning. */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-0.5 w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <BrainIcon className="size-3 text-muted-foreground/70 group-hover:text-foreground" />
        <span>Reasoning</span>
        <ChevronRightIcon
          className={cn(
            'size-3 text-muted-foreground/50 transition-transform duration-150 group-hover:text-foreground',
            open && 'rotate-90 text-foreground',
          )}
        />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap italic">
          {text}
        </div>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  status,
  error,
  onApproval,
  emptyState,
  onRetry,
}: MessageListProps) {
  if (messages.length === 0 && status === 'ready') {
    if (emptyState) return <>{emptyState}</>;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <span className="text-3xl">🤖</span>
          </div>
          <h2 className="text-lg font-semibold">Desktop AI Agent</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            I have access to your file system, terminal, clipboard, and local
            document search. Ask me anything, or try:{' '}
            <em>&quot;List the files in my home directory&quot;</em>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 px-4 py-5">
      {messages.map((message) => {
        // ── User turn: Capped-height prompt capsule with hover actions ────────
        if (message.role === 'user') {
          const textPart = message.parts.find((p) => p.type === 'text');
          const text = textPart && 'text' in textPart ? String(textPart.text) : '';
          const rawDate = (message as { createdAt?: unknown }).createdAt;
          const createdAt =
            typeof rawDate === 'number'
              ? rawDate
              : rawDate instanceof Date
                ? rawDate.getTime()
                : typeof rawDate === 'string'
                  ? new Date(rawDate).getTime()
                  : undefined;

          return (
            <UserPromptCapsule
              key={message.id}
              text={text}
              createdAt={createdAt}
              onRetry={onRetry}
            />
          );
        }

        // ── Assistant turn: Unboxed, document-style layout ─────────────────────
        return (
          <div key={message.id} className="flex w-full flex-col gap-2.5 text-sm">
            {message.parts.map((part, i) => {
              // ── Text part ──────────────────────────────────────────────────
              if (part.type === 'text') {
                return (
                  <div
                    key={`${message.id}-text-${i}`}
                    className="leading-relaxed text-foreground select-text"
                  >
                    <MessageResponse>{part.text}</MessageResponse>
                  </div>
                );
              }

              // ── Reasoning part ─────────────────────────────────────────────
              if (part.type === 'reasoning') {
                return (
                  <ReasoningBlock
                    key={`${message.id}-reasoning-${i}`}
                    text={part.text}
                  />
                );
              }

              // ── Tool part ──────────────────────────────────────────────────
              if (part.type.startsWith('tool-')) {
                const toolPart = part as unknown as ToolPartView;
                const toolCallId = toolPart.toolCallId;
                const toolName =
                  toolPart.toolName ?? part.type.replace(/^tool-/, '');
                const state = toolPart.state ?? 'input-available';
                const input = toolPart.input ?? {};
                const approval = toolPart.approval;

                // Awaiting a decision from the user.
                if (state === 'approval-requested' && approval?.id) {
                  const approvalId = approval.id;
                  return (
                    <Confirmation
                      key={`${message.id}-approval-${i}`}
                      approval={approval}
                      state="approval-requested"
                    >
                      <ConfirmationTitle>
                        Tool approval required: <code>{toolName}</code>
                      </ConfirmationTitle>
                      <ConfirmationRequest>
                        <div className="mt-1 space-y-1 text-sm">
                          {(approval as { requestReason?: string })
                            .requestReason && (
                            <p className="text-muted-foreground">
                              {
                                (approval as { requestReason?: string })
                                  .requestReason
                              }
                            </p>
                          )}
                          {Object.entries(input).map(([k, v]) => (
                            <div key={k}>
                              <span className="font-medium">{k}: </span>
                              <code className="text-xs">{String(v)}</code>
                            </div>
                          ))}
                        </div>
                      </ConfirmationRequest>
                      <ConfirmationActions>
                        <ConfirmationAction
                          variant="outline"
                          onClick={() =>
                            onApproval({
                              approvalId,
                              toolCallId,
                              approved: false,
                            })
                          }
                        >
                          Reject
                        </ConfirmationAction>
                        <ConfirmationAction
                          variant="default"
                          onClick={() =>
                            onApproval({ approvalId, toolCallId, approved: true })
                          }
                        >
                          Approve
                        </ConfirmationAction>
                      </ConfirmationActions>
                    </Confirmation>
                  );
                }

                // Decision made, tool (re)running.
                if (state === 'approval-responded' && approval) {
                  return (
                    <Confirmation
                      key={`${message.id}-approved-${i}`}
                      approval={approval}
                      state="approval-responded"
                    >
                      <ConfirmationAccepted>
                        <CheckIcon className="size-4" />
                        <span>Approved – executing {toolName}</span>
                      </ConfirmationAccepted>
                      <ConfirmationRejected>
                        <XIcon className="size-4" />
                        <span>Rejected – {toolName} skipped</span>
                      </ConfirmationRejected>
                    </Confirmation>
                  );
                }

                return (
                  <ToolCard
                    key={`${message.id}-tool-${i}`}
                    toolName={toolName}
                    input={input}
                    output={toolPart.output}
                    errorText={toolPart.errorText}
                    state={state}
                  />
                );
              }

              return null;
            })}
          </div>
        );
      })}

      {/* Streaming indicator */}
      {status === 'streaming' && (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Spinner className="h-3 w-3" />
          <span>Agent is thinking…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mx-1">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
