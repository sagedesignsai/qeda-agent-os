/**
 * hooks/use-agent-chat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * useChat-compatible hook that uses Electron IPC as its transport instead of
 * HTTP. The agent runs entirely in the main process; this hook receives the
 * JSON-serialised chunks of the AI SDK's `fullStream` (TextStreamPart) and
 * folds them into a UI-shaped `UIMessage[]` in real time.
 *
 * Because the agent loop is stateless, a turn is always "send the full message
 * list to main". That is what makes human-in-the-loop approvals work: responding
 * to an approval rewrites the tool part to `approval-responded` and re-runs the
 * turn, and `convertToModelMessages` (main side) turns that part into the
 * `tool-approval-response` message the model needs to continue.
 *
 * Exported API (mirrors @ai-sdk/react useChat):
 *   messages           – UIMessage[]
 *   sendMessage        – (text: string) => void
 *   respondToApproval  – ({ approvalId, toolCallId, approved }) => void
 *   status             – 'ready' | 'streaming' | 'error'
 *   error              – Error | undefined
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIpcEvent } from './use-ipc';
import type { AgentIntent } from '../main/ipc/channels';

export type AgentStatus = 'ready' | 'streaming' | 'error';

/** A single `fullStream` chunk (an AI SDK TextStreamPart) after JSON parsing. */
interface StreamPart {
  type: string;
  id?: string;
  text?: string;
  delta?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  errorText?: string;
  approvalId?: string;
  reason?: string;
  toolCall?: { toolCallId?: string; toolName?: string; input?: unknown };
}

/** Loosely-typed view of a UIMessage part, for incremental construction. */
type DraftPart = { type: string; [key: string]: unknown };

/** Where a turn is invoked and where its stream is pushed back from. */
export interface AgentTransport {
  invokeChannel: string;
  chunkChannel: string;
  doneChannel: string;
  errorChannel: string;
  fallbackChannel: string;
}

/** The main chat's transport. Other agents pass their own channel names. */
export const DEFAULT_AGENT_TRANSPORT: AgentTransport = {
  invokeChannel: 'agent:chat',
  chunkChannel: 'agent:stream-chunk',
  doneChannel: 'agent:stream-done',
  errorChannel: 'agent:stream-error',
  fallbackChannel: 'agent:stream-fallback',
};

export interface UseAgentChatOptions {
  sessionId: string;
  initialMessages?: UIMessage[];
  /** Workspace context bound to this chat (page, notebook, project, or take). */
  context?: {
    pageId?: string;
    notebookId?: string;
    projectId?: string;
    takeId?: string;
    currentTimeMs?: number;
    [key: string]: unknown;
  };
  /** Channel names for this agent. Defaults to the main chat's. */
  transport?: AgentTransport;
  /**
   * Declared operating mode for every turn this hook runs.
   *
   * Set it when the surface *knows* it is doing research or generating a
   * notebook — the dialog does, via the prompt it hands over. Leave it
   * undefined for free-form chat and main infers the mode from the wording.
   */
  intent?: AgentIntent;
  /** Persist the rebuilt conversation on completion (default true). */
  persist?: boolean;
  /** Load any persisted conversation for `sessionId` (default true). */
  hydrate?: boolean;
}

export interface RespondToApprovalArgs {
  approvalId: string;
  toolCallId: string;
  approved: boolean;
}

/** Set when a turn had to be retried on a different provider. */
export interface FallbackNotice {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  reason: string;
}

export interface UseAgentChatReturn {
  messages: UIMessage[];
  status: AgentStatus;
  error: Error | undefined;
  /** Populated when the active provider was rate limited or unavailable. */
  fallbackNotice: FallbackNotice | undefined;
  dismissFallbackNotice: () => void;
  sendMessage: (text: string) => void;
  respondToApproval: (args: RespondToApprovalArgs) => void;
  clearMessages: () => void;
}

// ─── Stream folding ───────────────────────────────────────────────────────────

const isToolPart = (part: DraftPart, toolCallId: string | undefined): boolean =>
  part.type.startsWith('tool-') && part.toolCallId === toolCallId;

/**
 * Fold one stream chunk into the message list.
 *
 * Always operates on the trailing assistant message, appending one first if the
 * last message is not already an assistant turn.
 */
export function applyStreamPart(
  messages: UIMessage[],
  part: StreamPart,
): UIMessage[] {
  const next = messages.slice();
  let last = next[next.length - 1];

  if (!last || last.role !== 'assistant') {
    last = { id: crypto.randomUUID(), role: 'assistant', parts: [] };
    next.push(last);
  }

  const parts = (last.parts as unknown as DraftPart[]).slice();
  const commit = () => {
    next[next.length - 1] = {
      ...last,
      parts: parts as unknown as UIMessage['parts'],
    } as UIMessage;
  };

  /** Append to the trailing part when it matches, otherwise start a new one. */
  const appendToTrailing = (type: string, text: string) => {
    const trailing = parts[parts.length - 1];
    if (trailing?.type === type) {
      parts[parts.length - 1] = {
        ...trailing,
        text: `${String(trailing.text ?? '')}${text}`,
      };
    } else {
      parts.push({ type, text });
    }
  };

  /** Patch an existing tool part in place (upserting when `create` is given). */
  const patchToolPart = (
    toolCallId: string | undefined,
    patch: Record<string, unknown>,
    create?: () => DraftPart,
  ) => {
    const index = parts.findIndex((p) => isToolPart(p, toolCallId));
    if (index >= 0) {
      parts[index] = { ...parts[index], ...patch };
    } else if (create) {
      parts.push({ ...create(), ...patch });
    }
  };

  switch (part.type) {
    // ── Assistant text ───────────────────────────────────────────────────────
    case 'text-delta':
      appendToTrailing('text', part.text ?? part.delta ?? '');
      break;

    // ── Reasoning / chain of thought ─────────────────────────────────────────
    case 'reasoning-delta':
      appendToTrailing('reasoning', part.text ?? part.delta ?? '');
      break;

    // ── Tool calls ───────────────────────────────────────────────────────────
    case 'tool-input-start':
      patchToolPart(part.id, { state: 'input-streaming' }, () => ({
        type: `tool-${part.toolName ?? 'unknown'}`,
        toolCallId: part.id,
        toolName: part.toolName,
      }));
      break;

    case 'tool-call':
      patchToolPart(
        part.toolCallId,
        { input: part.input, state: 'input-available' },
        () => ({
          type: `tool-${part.toolName ?? 'unknown'}`,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
        }),
      );
      break;

    case 'tool-approval-request': {
      const toolCallId = part.toolCall?.toolCallId ?? part.toolCallId;
      patchToolPart(toolCallId, {
        state: 'approval-requested',
        approval: { id: part.approvalId, requestReason: part.reason },
      });
      break;
    }

    case 'tool-result':
      patchToolPart(part.toolCallId, {
        state: 'output-available',
        output: part.output,
      });
      break;

    case 'tool-error':
      patchToolPart(part.toolCallId, {
        state: 'output-error',
        errorText:
          part.errorText ?? String(part.error ?? 'Tool execution failed'),
      });
      break;

    case 'tool-output-denied':
      patchToolPart(part.toolCallId, { state: 'output-denied' });
      break;

    // Everything else (start, finish, step boundaries, sources, …) is not
    // rendered, so it is intentionally dropped.
    default:
      return messages;
  }

  commit();
  return next;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentChat({
  sessionId,
  initialMessages = [],
  context,
  transport = DEFAULT_AGENT_TRANSPORT,
  intent,
  persist = true,
  hydrate = true,
}: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [status, setStatus] = useState<AgentStatus>('ready');
  const [error, setError] = useState<Error | undefined>();
  const [fallbackNotice, setFallbackNotice] = useState<
    FallbackNotice | undefined
  >();

  // Refs mirror state so IPC listeners (bound once) always see current values.
  const messagesRef = useRef<UIMessage[]>(initialMessages);
  const sessionIdRef = useRef(sessionId);
  const contextRef = useRef(context);
  // Mirrored the same way: `runTurn` is a `useCallback` bound to the transport,
  // so a bare `intent` in its closure would go stale on the second turn.
  const intentRef = useRef(intent);
  const streamingRef = useRef(false);

  // Keep the context ref current without re-binding IPC listeners.
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    intentRef.current = intent;
  }, [intent]);

  /** Update state and the mirror ref together, synchronously. */
  const commitMessages = useCallback(
    (updater: (prev: UIMessage[]) => UIMessage[]) => {
      const next = updater(messagesRef.current);
      messagesRef.current = next;
      setMessages(next);
    },
    [],
  );

  const failTurn = useCallback((err: unknown) => {
    streamingRef.current = false;
    setError(err instanceof Error ? err : new Error(String(err)));
    setStatus('error');
  }, []);

  // ── Streaming events from the main process ────────────────────────────────

  useIpcEvent(transport.chunkChannel, (raw: unknown) => {
    const line = String(raw);
    if (!line.trim()) return;
    try {
      const part = JSON.parse(line) as StreamPart;
      commitMessages((prev) => applyStreamPart(prev, part));
    } catch {
      // Ignore malformed chunk payloads.
    }
  });

  useIpcEvent(
    transport.doneChannel,
    () => {
      streamingRef.current = false;
      setStatus('ready');

      if (!persist) return;
      // Persist the reconstructed conversation so it survives a restart and
      // shows up in the rail's conversation list. Upserts are keyed by message
      // id.
      const current = messagesRef.current;
      const activeSession = sessionIdRef.current;
      if (!activeSession || current.length === 0) return;
      window.electron.ipc
        .invoke('sessions:save-messages', {
          sessionId: activeSession,
          messages: current,
        })
        .catch(() => {
          // Persistence is best-effort – never block the UI on it.
        });
    },
    [persist],
  );

  useIpcEvent(
    transport.errorChannel,
    (payload: unknown) => {
      failTurn(
        new Error(
          (payload as { error?: string })?.error ?? 'Unknown agent error',
        ),
      );
    },
    [],
  );

  // The main process retried the turn on another provider. No output had been
  // rendered yet, so the turn simply continues – we only explain the swap.
  useIpcEvent(
    transport.fallbackChannel,
    (payload: unknown) => {
      const notice = payload as Partial<FallbackNotice>;
      if (!notice?.toProvider) return;
      setFallbackNotice(notice as FallbackNotice);
    },
    [],
  );

  // ── Turn runner ───────────────────────────────────────────────────────────

  const runTurn = useCallback(() => {
    setError(undefined);
    setFallbackNotice(undefined);
    setStatus('streaming');
    streamingRef.current = true;
    window.electron.ipc
      .invoke(transport.invokeChannel, {
        sessionId: sessionIdRef.current,
        messages: messagesRef.current,
        context: contextRef.current,
        // Omitted entirely when unset, so main's heuristic stays the fallback.
        ...(intentRef.current ? { intent: intentRef.current } : {}),
      })
      .catch(failTurn);
  }, [failTurn, transport.invokeChannel]);

  // ── Send a new user message ───────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string) => {
      if (streamingRef.current || !text.trim()) return;

      const userMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      } as UIMessage;

      commitMessages((prev) => [...prev, userMessage]);
      runTurn();
    },
    [commitMessages, runTurn],
  );

  // ── Answer an approval request and resume the run ─────────────────────────

  const respondToApproval = useCallback(
    ({ approvalId, toolCallId, approved }: RespondToApprovalArgs) => {
      if (streamingRef.current) return;

      commitMessages((prev) =>
        prev.map((message) => {
          if (message.role !== 'assistant') return message;
          const parts = message.parts as unknown as DraftPart[];
          if (!parts.some((p) => isToolPart(p, toolCallId))) return message;

          return {
            ...message,
            parts: parts.map((p) =>
              isToolPart(p, toolCallId)
                ? {
                    ...p,
                    state: 'approval-responded',
                    approval: { id: approvalId, approved },
                  }
                : p,
            ) as unknown as UIMessage['parts'],
          } as UIMessage;
        }),
      );

      runTurn();
    },
    [commitMessages, runTurn],
  );

  // ── Reset messages ────────────────────────────────────────────────────────

  const clearMessages = useCallback(() => {
    commitMessages(() => []);
    setStatus('ready');
    setError(undefined);
  }, [commitMessages]);

  // ── Hydrate from the database when the session changes ────────────────────

  const hydrationTokenRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    const token = hydrationTokenRef.current + 1;
    hydrationTokenRef.current = token;

    if (!hydrate || !sessionId) {
      if (!hydrate) commitMessages(() => initialMessages);
      return undefined;
    }

    window.electron.ipc
      .invoke<UIMessage[]>('sessions:messages', { id: sessionId })
      .then((loaded) => {
        // Drop stale responses, and never overwrite a turn that has already
        // started for this session (e.g. the first message of a new chat).
        if (token !== hydrationTokenRef.current || streamingRef.current) return;
        if (!Array.isArray(loaded)) return;
        commitMessages(() => loaded);
      })
      .catch(() => {
        // A missing session simply renders as an empty conversation.
      });

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, commitMessages, hydrate]);

  const dismissFallbackNotice = useCallback(
    () => setFallbackNotice(undefined),
    [],
  );

  return {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  };
}
