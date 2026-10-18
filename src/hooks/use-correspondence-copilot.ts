/**
 * hooks/use-correspondence-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds the shared `useAgentChat` machinery to the correspondence copilot's IPC
 * channels. The sheet is presentation only; this hook owns the transport.
 *
 * Ephemeral by default (`persist: false`, `hydrate: false`): it is a working
 * session over the board, not a chat thread to file away. The streamed actions
 * are what persist (draft, recipients, escalation task text, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type UseAgentChatReturn, useAgentChat } from './use-agent-chat';

/** Namespaced so a correspondence copilot turn never collides with a main-chat turn. */
const CORRESPONDENCE_TRANSPORT = {
  invokeChannel: 'correspondence-copilot:chat',
  chunkChannel: 'correspondence-copilot:stream-chunk',
  doneChannel: 'correspondence-copilot:stream-done',
  errorChannel: 'correspondence-copilot:stream-error',
  fallbackChannel: 'correspondence-copilot:stream-fallback',
};

export function useCorrespondenceCopilot(opts?: {
  projectId?: string;
}): UseAgentChatReturn {
  return useAgentChat({
    sessionId: 'correspondence-copilot',
    transport: CORRESPONDENCE_TRANSPORT,
    context: opts?.projectId ? { projectId: opts.projectId } : undefined,
    persist: false,
    hydrate: false,
  });
}
