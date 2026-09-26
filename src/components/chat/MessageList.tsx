/**
 * components/chat/MessageList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the list of UIMessages using ai-elements components.
 *
 * Handles:
 *   • User messages (right-aligned bubble)
 *   • Assistant text messages with streaming markdown
 *   • Reasoning ("thinking") blocks
 *   • Tool calls – status card, terminal output for shell commands
 *   • Tool approvals – human-in-the-loop approve / reject
 *   • Streaming indicator
 *   • Error state
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
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
import { AlertCircleIcon, BrainIcon, CheckIcon, XIcon } from 'lucide-react';

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

interface MessageListProps {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'error';
  error: Error | undefined;
  onApproval: (args: {
    approvalId: string;
    toolCallId: string;
    approved: boolean;
  }) => void;
}

/** Collapsible "thinking" block for model reasoning. */
function ReasoningBlock({ text }: { text: string }) {
  return (
    <details className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground">
        <BrainIcon className="size-3.5" />
        <span>Reasoning</span>
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-muted-foreground italic">
        {text}
      </p>
    </details>
  );
}

export function MessageList({
  messages,
  status,
  error,
  onApproval,
}: MessageListProps) {
  if (messages.length === 0 && status === 'ready') {
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
    <div className="flex flex-col gap-4 px-4 py-6">
      {messages.map((message) => (
        <Message key={message.id} from={message.role}>
          <MessageContent>
            {message.parts.map((part, i) => {
              // ── Text part ──────────────────────────────────────────────────
              if (part.type === 'text') {
                return (
                  <MessageResponse key={`${message.id}-text-${i}`}>
                    {part.text}
                  </MessageResponse>
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
          </MessageContent>
        </Message>
      ))}

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
