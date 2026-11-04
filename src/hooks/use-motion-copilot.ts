/**
 * hooks/use-motion-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the Motion Copilot Agent to IPC streaming channels.
 *
 * Runs turns over `motion-copilot:*` channels with project and document context.
 * Ephemeral session (persist: false, hydrate: false) — the scene mutations
 * via tools are what persist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';
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

  const { plan, clearPlan } = useIpcPlan('motion-copilot:plan-event', agent.messages);

  return { ...agent, plan, clearPlan };
}
