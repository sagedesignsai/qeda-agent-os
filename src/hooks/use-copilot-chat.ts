/**
 * hooks/use-copilot-chat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds the shared `useAgentChat` machinery to the copilot's IPC channels.
 *
 * The copilot conversation is deliberately ephemeral (`persist: false`,
 * `hydrate: false`): it is a working session against the task board, not a
 * chat thread to file away. The tools it calls are what persist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useAgentChat, type AgentTransport, type UseAgentChatReturn } from './use-agent-chat';

/** Namespaced so a copilot turn never collides with a main-chat turn. */
const COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'copilot:chat',
  chunkChannel: 'copilot:stream-chunk',
  doneChannel: 'copilot:stream-done',
  errorChannel: 'copilot:stream-error',
  fallbackChannel: 'copilot:stream-fallback',
};

export function useCopilotChat(opts?: { projectId?: string }): UseAgentChatReturn {
  return useAgentChat({
    sessionId: 'focus-copilot',
    transport: COPILOT_TRANSPORT,
    context: opts?.projectId ? { projectId: opts.projectId } : undefined,
    persist: false,
    hydrate: false,
  });
}
