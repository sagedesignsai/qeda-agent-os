/**
 * hooks/use-model-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the Model Builder Agent to IPC streaming channels.
 *
 * Runs turns over `model-builder:*` channels with the ephemeral document
 * context. The session is ephemeral (persist: false, hydrate: false) — the
 * scene mutations via tools are what persist within the dialog's document.
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

const MODEL_BUILDER_TRANSPORT: AgentTransport = {
  invokeChannel: 'model-builder:chat',
  chunkChannel: 'model-builder:stream-chunk',
  doneChannel: 'model-builder:stream-done',
  errorChannel: 'model-builder:stream-error',
  fallbackChannel: 'model-builder:stream-fallback',
};

export interface UseModelBuilderOptions {
  /** The ephemeral Motion document for the agent to operate on. */
  document: MotionDocument;
  /** Real project the dialog was opened from, for GLB asset staging. */
  projectId?: string;
}

export interface UseModelBuilderReturn extends UseAgentChatReturn {
  plan: AgentPlan | null;
  clearPlan: () => void;
}

export function useModelBuilder({
  document,
  projectId,
}: UseModelBuilderOptions): UseModelBuilderReturn {
  const agent = useAgentChat({
    sessionId: 'model-builder',
    transport: MODEL_BUILDER_TRANSPORT,
    context: {
      document,
      projectId,
    },
    persist: false,
    hydrate: false,
  });

  const { plan, clearPlan } = useIpcPlan(
    'model-builder:plan-event',
    agent.messages,
  );

  return { ...agent, plan, clearPlan };
}
