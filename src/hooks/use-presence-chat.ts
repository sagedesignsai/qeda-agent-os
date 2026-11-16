/**
 * hooks/use-presence-chat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds the shared `useAgentChat` machinery to the Presence Copilot's IPC
 * channels, and subscribes to its plan events.
 *
 * The conversation is ephemeral on purpose (`persist: false`, `hydrate: false`):
 * it is a working session against the presence board, not a chat thread to file
 * in the rail. What persists is what the agent *does* — batches, items, posts,
 * profile and streak — and `presence:changed` brings those back into view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import { useAgentChat } from './use-agent-chat';
import { useIpcPlan } from './use-agent-plan';

const PRESENCE_TRANSPORT = {
  invokeChannel: 'presence:chat',
  chunkChannel: 'presence-copilot:stream-chunk',
  doneChannel: 'presence-copilot:stream-done',
  errorChannel: 'presence-copilot:stream-error',
  fallbackChannel: 'presence-copilot:stream-fallback',
} as const;

export interface PresenceChatState {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'error';
  error: Error | undefined;
  fallbackNotice:
    | {
        fromProvider: string;
        fromModel: string;
        toProvider: string;
        toModel: string;
        reason: string;
      }
    | undefined;
  dismissFallbackNotice: () => void;
  sendMessage: (text: string) => void;
  respondToApproval: (args: {
    approvalId: string;
    toolCallId: string;
    approved: boolean;
  }) => void;
  abortStream: () => void;
  clearMessages: () => void;
  plan: ReturnType<typeof useIpcPlan>['plan'];
  clearPlan: () => void;
}

export function usePresenceChat(projectId: string | null): PresenceChatState {
  const chat = useAgentChat({
    sessionId: 'presence-copilot',
    transport: PRESENCE_TRANSPORT,
    context: projectId ? { projectId } : undefined,
    persist: false,
    hydrate: false,
  });

  const { plan, clearPlan } = useIpcPlan(
    'presence-copilot:plan-event',
    chat.messages,
    'presence-copilot',
  );

  return { ...chat, plan, clearPlan };
}
