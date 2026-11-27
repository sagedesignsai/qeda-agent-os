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
  const sessionId = `trace-surface-generation:${request?.projectId ?? 'scratch'}`;
  const [proposal, setProposal] = useState<SurfaceGenerationProposal | null>(null);

  const context = useMemo(
    () => (request ?? {}) as unknown as Record<string, unknown>,
    [request],
  );

  const agent = useAgentChat({
    sessionId,
    transport: SURFACE_TRANSPORT,
    context,
    // The conversation is part of the workspace: reopening the generator
    // restores the brief and the back-and-forth that produced a surface.
    persist: true,
    hydrate: true,
  });

  // The staged event arrives mid-turn, the moment the specialist compiles a
  // valid proposal — that is what makes the preview realtime.
  useIpcEvent(
    'trace-surface-generation:staged',
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