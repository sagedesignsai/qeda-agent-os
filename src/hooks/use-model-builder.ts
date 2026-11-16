/**
 * hooks/use-model-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the Model Builder Agent to IPC streaming channels.
 *
 * Runs turns over `model-builder:*` channels with the ephemeral document
 * context. The DOCUMENT is still ephemeral (the dialog owns it and decides
 * whether to promote it into the project), but the CONVERSATION is persisted:
 * a stable per-project session id means reopening the dialog — or restarting
 * the app — resumes the same thread. That is a development aid: the transcript
 * of a failed generation is the only place the harness report, staged asset id,
 * and tool errors survive.
 *
 * `sessions:save-messages` inserts rows that reference `sessions(id)`, so the
 * session row must exist before the first turn persists; `sessions:ensure` is
 * idempotent and cheap.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';

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
  /** Persisted session the transcript lives in. */
  sessionId: string;
}

/** One persisted thread per project; scratch dialogues keep their own slot. */
export function modelBuilderSessionId(projectId?: string): string {
  return `model-builder:${projectId ?? 'scratch'}`;
}

export function useModelBuilder({
  document,
  projectId,
}: UseModelBuilderOptions): UseModelBuilderReturn {
  const sessionId = modelBuilderSessionId(projectId);

  useEffect(() => {
    // Idempotent: a persisted session's row already exists, and the message
    // table's foreign key makes the row mandatory for the first save.
    window.electron?.ipc
      ?.invoke('sessions:ensure', {
        id: sessionId,
        title: 'Model Builder',
        projectId: projectId ?? null,
      })
      ?.catch(() => {
        // Persistence is best-effort — never block the dialog on it.
      });
  }, [sessionId, projectId]);

  const agent = useAgentChat({
    sessionId,
    transport: MODEL_BUILDER_TRANSPORT,
    context: {
      document,
      projectId,
    },
    persist: true,
    hydrate: true,
  });

  const { plan, clearPlan } = useIpcPlan(
    'model-builder:plan-event',
    agent.messages,
  );

  return { ...agent, plan, clearPlan, sessionId };
}
