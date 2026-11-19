/**
 * hooks/use-studio-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the Studio Copilot Agent to IPC streaming channels.
 *
 * Runs turns over `studio-copilot:*` channels with take and playhead context.
 * Ephemeral session (persist: false, hydrate: false) — the video take and
 * timeline mutations are what persist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';
import { useIpcPlan } from './use-agent-plan';
import type { AgentPlan } from '@/lib/agent-plan';

const STUDIO_COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'studio-copilot:chat',
  chunkChannel: 'studio-copilot:stream-chunk',
  doneChannel: 'studio-copilot:stream-done',
  errorChannel: 'studio-copilot:stream-error',
  fallbackChannel: 'studio-copilot:stream-fallback',
};

export interface UseStudioCopilotOptions {
  takeId: string;
  projectId?: string;
  currentTimeMs?: number;
}

export interface UseStudioCopilotReturn extends UseAgentChatReturn {
  plan: AgentPlan | null;
  clearPlan: () => void;
}

export function useStudioCopilot({
  takeId,
  projectId,
  currentTimeMs,
}: UseStudioCopilotOptions): UseStudioCopilotReturn {
  const agent = useAgentChat({
    sessionId: `studio-copilot-${takeId}`,
    transport: STUDIO_COPILOT_TRANSPORT,
    context: {
      takeId,
      projectId,
      currentTimeMs,
    },
    persist: false,
    hydrate: false,
  });

  const { plan, clearPlan } = useIpcPlan('studio-copilot:plan-event', agent.messages);

  return { ...agent, plan, clearPlan };
}
