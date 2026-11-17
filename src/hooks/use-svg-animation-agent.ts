import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SvgAnimationPlayback, TraceAnimationPlan } from '@/lib/trace/animation-plan';
import type { TraceProject } from '@/lib/trace/types';
import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';
import { useIpcEvent } from './use-ipc';

const SVG_ANIMATION_TRANSPORT: AgentTransport = {
  invokeChannel: 'trace-svg-animation:chat',
  chunkChannel: 'trace-svg-animation:stream-chunk',
  doneChannel: 'trace-svg-animation:stream-done',
  errorChannel: 'trace-svg-animation:stream-error',
  fallbackChannel: 'trace-svg-animation:stream-fallback',
  abortChannel: 'trace-svg-animation:abort',
};

export interface UseSvgAnimationAgentOptions {
  project: TraceProject | null;
  targetElementId?: string | null;
  motion: 'custom' | 'flicker' | 'sway' | 'pulse' | 'reveal';
  playback: SvgAnimationPlayback;
  durationMs: number;
  intensity: number;
}

export interface UseSvgAnimationAgentReturn extends UseAgentChatReturn {
  proposal: TraceAnimationPlan | null;
  clearProposal: () => void;
}

export function useSvgAnimationAgent({
  project,
  targetElementId,
  motion,
  playback,
  durationMs,
  intensity,
}: UseSvgAnimationAgentOptions): UseSvgAnimationAgentReturn {
  const sessionId = `trace-svg-animation:${project?.id ?? 'none'}:${targetElementId ?? 'none'}`;
  const [proposal, setProposal] = useState<TraceAnimationPlan | null>(null);
  const context = useMemo(() => ({
    project,
    targetElementId,
    motion,
    playback,
    durationMs,
    intensity,
  }), [project, targetElementId, motion, playback, durationMs, intensity]);

  const agent = useAgentChat({
    sessionId,
    transport: SVG_ANIMATION_TRANSPORT,
    context,
    persist: false,
    hydrate: false,
  });

  useIpcEvent('trace-svg-animation:proposal', (raw: unknown) => {
    const payload = raw as { sessionId?: string; plan?: TraceAnimationPlan };
    if (payload.sessionId === sessionId && payload.plan) setProposal(payload.plan);
  }, [sessionId]);

  useEffect(() => setProposal(null), [sessionId]);

  const clearProposal = useCallback(() => setProposal(null), []);

  return {
    ...agent,
    proposal,
    clearProposal,
  };
}
