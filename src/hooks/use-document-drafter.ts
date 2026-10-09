/**
 * hooks/use-document-drafter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds the shared `useAgentChat` machinery to the Document Drafter's IPC
 * channels.
 *
 * The drafter is a stateless ToolLoopAgent, so this hook owns no conversation
 * of its own — every turn ships the whole message list to main and the streams
 * come back on `document-drafter:stream-*`. What persists is not the thread but
 * the documents it writes, so the session is deliberately ephemeral
 * (`persist: false`, `hydrate: false`) exactly like the task and studio
 * copilots.
 *
 * `context` is optional in full: leaving every field undefined means "draft a
 * new document from scratch, with no project and no task", which is a real
 * state the sheet supports rather than a degraded one.
 *
 * WHY `stream-truncated` IS NOT IN THE TRANSPORT
 * ───────────────────────────────────────────────────────────────
 * The agent has a step ceiling, and a run that exhausts it stops MID-DOCUMENT.
 * `stream-done` still fires for such a run, so from the UI's point of view the
 * turn looks like a clean finish — which for a letter or an agreement is the
 * worst failure available: a half-written instrument that reads as complete.
 *
 * `AgentTransport` is a fixed five-field interface (`use-agent-chat.ts`), and
 * the run summary inside `useAgentChat` has no hook for extra per-run signals,
 * so rather than widen a shared type this hook subscribes to the channel
 * directly and surfaces the signal itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import { useIpcEvent } from './use-ipc';
import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';

/** Namespaced, so a drafting turn can never collide with a chat or copilot turn. */
const DOCUMENT_DRAFTER_TRANSPORT: AgentTransport = {
  invokeChannel: 'document-drafter:chat',
  chunkChannel: 'document-drafter:stream-chunk',
  doneChannel: 'document-drafter:stream-done',
  errorChannel: 'document-drafter:stream-error',
  fallbackChannel: 'document-drafter:stream-fallback',
};

export interface UseDocumentDrafterOptions {
  /** Drafting in place inside this document rather than creating a new one. */
  documentId?: string;
  /** Project (client matter) the draft belongs to, and the project material. */
  projectId?: string;
  /** Task the document is FOR. Context for the prose only — no task tools. */
  taskId?: string;
}

/**
 * Set when the last run stopped because it ran out of step budget.
 *
 * `steps` is where it stopped, `budget` the ceiling it stopped against. Both
 * are surfaced because "you have 20 steps per turn" is only actionable as a
 * number.
 */
export interface TruncationNotice {
  steps: number;
  budget: number;
}

export interface UseDocumentDrafterReturn extends UseAgentChatReturn {
  /** Present only after a run has been cut short. Cleared on the next turn. */
  truncationNotice: TruncationNotice | undefined;
  clearTruncationNotice: () => void;
}

export function useDocumentDrafter({
  documentId,
  projectId,
  taskId,
}: UseDocumentDrafterOptions): UseDocumentDrafterReturn {
  const agent = useAgentChat({
    sessionId: 'document-drafter',
    transport: DOCUMENT_DRAFTER_TRANSPORT,
    // Omitted entirely rather than sent as three undefined keys: main reads an
    // absent context as "no scope at all", which is the honest encoding.
    context:
      documentId || projectId || taskId
        ? { documentId, projectId, taskId }
        : undefined,
    persist: false,
    hydrate: false,
  });

  const { sendMessage: agentSendMessage } = agent;

  const [truncationNotice, setTruncationNotice] = useState<
    TruncationNotice | undefined
  >(undefined);

  // Fires just before `stream-done`, so the turn's own `status` goes to 'ready'
  // a moment later. Nothing to sequence here — this is a separate fact about
  // the run that just finished, not a second view of the same stream.
  useIpcEvent('document-drafter:stream-truncated', (payload) => {
    const notice = payload as Partial<TruncationNotice> | undefined;
    // Guard the shape rather than trusting it: a notice that renders
    // "stopped at step undefined of undefined" is worse than no notice.
    if (
      typeof notice?.steps !== 'number' ||
      typeof notice?.budget !== 'number'
    ) {
      return;
    }
    setTruncationNotice({ steps: notice.steps, budget: notice.budget });
  });

  const clearTruncationNotice = useCallback(
    () => setTruncationNotice(undefined),
    [],
  );

  /**
   * `sendMessage` wrapped so a new turn clears the previous run's warning.
   *
   * The wrap is deliberate and narrow: the truncation belongs to a specific run
   * and to the document that run was writing, so carrying it over a fresh brief
   * would be a lie about the document now on screen. An approval response
   * deliberately does NOT clear it — answering a gate resumes the same
   * half-finished draft, so the same warning is still true.
   */
  const sendMessage = useCallback(
    (text: string) => {
      setTruncationNotice(undefined);
      agentSendMessage(text);
    },
    [agentSendMessage],
  );

  return { ...agent, sendMessage, truncationNotice, clearTruncationNotice };
}
