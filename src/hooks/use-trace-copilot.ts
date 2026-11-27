/**
 * hooks/use-trace-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the NovaTrace Copilot Agent to IPC streaming channels.
 *
 * Runs turns over `trace-copilot:*` channels with project context.
 * Ephemeral session (persist: false, hydrate: false) — the composition
 * mutations via tools are what persist.
 *
 * Drift: if a copilot save loses a revision race with an editor save, main
 * pushes `trace-copilot:drift`; the user's copy was kept and the turn's changes
 * were not applied. The notice is surfaced, never swallowed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import {
  useAgentChat,
  type AgentDriftNotice,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';
import { useIpcEvent } from './use-ipc';
import { useIpcPlan } from './use-agent-plan';
import type { AgentPlan } from '@/lib/agent-plan';

const TRACE_COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'trace-copilot:chat',
  chunkChannel: 'trace-copilot:stream-chunk',
  doneChannel: 'trace-copilot:stream-done',
  errorChannel: 'trace-copilot:stream-error',
  fallbackChannel: 'trace-copilot:stream-fallback',
};

export interface UseTraceCopilotOptions {
  traceProjectId?: string;
  projectId?: string;
}

export interface UseTraceCopilotReturn extends UseAgentChatReturn {
  plan: AgentPlan | null;
  clearPlan: () => void;
  driftNotice: AgentDriftNotice | undefined;
  dismissDriftNotice: () => void;
}

export function useTraceCopilot({
  traceProjectId,
  projectId,
}: UseTraceCopilotOptions): UseTraceCopilotReturn {
  const agent = useAgentChat({
    sessionId: `trace-copilot-${traceProjectId ?? 'new'}`,
    transport: TRACE_COPILOT_TRANSPORT,
    context: {
      traceProjectId,
      projectId,
    },
    persist: false,
    hydrate: false,
  });

  const [driftNotice, setDriftNotice] = useState<AgentDriftNotice | undefined>();

  useIpcEvent(
    'trace-copilot:drift',
    (payload: unknown) => {
      const notice = payload as Partial<AgentDriftNotice> | undefined;
      if (!notice?.message) return;
      setDriftNotice(notice as AgentDriftNotice);
    },
    [],
  );

  const dismissDriftNotice = useCallback(() => setDriftNotice(undefined), []);

  const { plan, clearPlan } = useIpcPlan(
    'trace-copilot:plan-event',
    agent.messages,
  );

  return { ...agent, plan, clearPlan, driftNotice, dismissDriftNotice };
}