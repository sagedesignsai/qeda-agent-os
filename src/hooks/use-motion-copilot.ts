/**
 * hooks/use-motion-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the Motion Copilot Agent to IPC streaming channels.
 *
 * Runs turns over `motion-copilot:*` channels with project and document context.
 * Ephemeral session (persist: false, hydrate: false) — the scene mutations
 * via tools are what persist.
 *
 * Drift: if a copilot save loses a revision race with an editor save, main
 * pushes `motion-copilot:drift`; the user's copy was kept and the turn's changes
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
import type { MotionDocument } from '@/lib/motion/types';

const MOTION_COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'motion-copilot:chat',
  chunkChannel: 'motion-copilot:stream-chunk',
  doneChannel: 'motion-copilot:stream-done',
  errorChannel: 'motion-copilot:stream-error',
  fallbackChannel: 'motion-copilot:stream-fallback',
};

export interface UseMotionCopilotOptions {
  projectId?: string;
  /** The current Motion document snapshot for the agent to operate on. */
  document: MotionDocument;
}

export interface UseMotionCopilotReturn extends UseAgentChatReturn {
  plan: AgentPlan | null;
  clearPlan: () => void;
  driftNotice: AgentDriftNotice | undefined;
  dismissDriftNotice: () => void;
}

export function useMotionCopilot({
  projectId,
  document,
}: UseMotionCopilotOptions): UseMotionCopilotReturn {
  const agent = useAgentChat({
    sessionId: `motion-copilot-${projectId ?? 'untitled'}`,
    transport: MOTION_COPILOT_TRANSPORT,
    context: {
      projectId,
      document,
    },
    persist: false,
    hydrate: false,
  });

  const [driftNotice, setDriftNotice] = useState<AgentDriftNotice | undefined>();

  useIpcEvent(
    'motion-copilot:drift',
    (payload: unknown) => {
      const notice = payload as Partial<AgentDriftNotice> | undefined;
      if (!notice?.message) return;
      setDriftNotice(notice as AgentDriftNotice);
    },
    [],
  );

  const dismissDriftNotice = useCallback(() => setDriftNotice(undefined), []);

  const { plan, clearPlan } = useIpcPlan('motion-copilot:plan-event', agent.messages);

  return { ...agent, plan, clearPlan, driftNotice, dismissDriftNotice };
}