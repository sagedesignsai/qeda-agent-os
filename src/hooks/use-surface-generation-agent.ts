import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  SurfaceGenerationProposal,
  SurfaceGenerationRequest,
} from '@/lib/trace/addons/surfaces/generation';
import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';
import { useIpcEvent } from './use-ipc';

const SURFACE_TRANSPORT: AgentTransport = {
  invokeChannel: 'trace-surface-generation:chat',
  chunkChannel: 'trace-surface-generation:stream-chunk',
  doneChannel: 'trace-surface-generation:stream-done',
  errorChannel: 'trace-surface-generation:stream-error',
  fallbackChannel: 'trace-surface-generation:stream-fallback',
  abortChannel: 'trace-surface-generation:abort',
};

export interface UseSurfaceGenerationAgentReturn extends UseAgentChatReturn {
  proposal: SurfaceGenerationProposal | null;
  clearProposal: () => void;
}

export function useSurfaceGenerationAgent(
  request: SurfaceGenerationRequest | null,
): UseSurfaceGenerationAgentReturn {
  const sessionId = `trace-surface-generation:${request?.projectName ?? 'none'}:${request?.width ?? 0}x${request?.height ?? 0}`;
  const [proposal, setProposal] = useState<SurfaceGenerationProposal | null>(null);

  const context = useMemo(
    () => (request ?? {}) as unknown as Record<string, unknown>,
    [request],
  );

  const agent = useAgentChat({
    sessionId,
    transport: SURFACE_TRANSPORT,
    context,
    persist: false,
    hydrate: false,
  });

  useIpcEvent(
    'trace-surface-generation:proposal',
    (raw: unknown) => {
      const payload = raw as {
        sessionId?: string;
        proposal?: SurfaceGenerationProposal;
      };
      if (payload.sessionId === sessionId && payload.proposal) {
        setProposal(payload.proposal);
      }
    },
    [sessionId],
  );

  useEffect(() => setProposal(null), [sessionId]);

  const clearProposal = useCallback(() => setProposal(null), []);

  return { ...agent, proposal, clearProposal };
}