/**
 * hooks/use-ignition-candidate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "What should I start, and what is the first physical move inside it?"
 *
 * Two surfaces answer that question now — the rail's ignition card and the
 * Launch card on a project page — and they must never disagree about which
 * task is next. The selection therefore lives here rather than in either
 * component: `getNextBestMove` scores, and the task's first undone step
 * becomes the headline, because "write one sentence" is startable where
 * "write the positioning statement" is not.
 *
 * `active` is included as a candidate status on purpose. A task that was
 * opened and abandoned is the best thing to resume, and the backlog-only
 * filter the Today launchpad uses would hide exactly the work that stalled.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useIpcEvent } from './use-ipc';
import {
  getNextBestMove,
  type TaskRecommendation,
} from '@/lib/task-recommendations';
import type { Task, TaskStep } from '@/main/ipc/channels';

export interface IgnitionCandidate {
  /** Null when nothing is worth starting in this scope. */
  candidate: TaskRecommendation | null;
  /** First undone step of the candidate, or null when it has no steps. */
  firstMove: string | null;
  /** True until the first read settles, so a surface can avoid flashing. */
  loading: boolean;
}

export interface UseIgnitionCandidateOptions {
  /**
   * False parks the reads: the caller is already showing a session, is on a
   * surface that carries its own launchpad, or the user declined for the day.
   */
  enabled?: boolean;
}

export function useIgnitionCandidate(
  projectId: string | null,
  { enabled = true }: UseIgnitionCandidateOptions = {},
): IgnitionCandidate {
  const [candidate, setCandidate] = useState<TaskRecommendation | null>(null);
  const [firstMove, setFirstMove] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [version, setVersion] = useState(0);

  // Any mutation anywhere — completing a step, adding a task from the agent —
  // can change the answer, so the pick is refetched on the same broadcast the
  // rest of the app listens to.
  useIpcEvent('tasks:changed', () => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) {
      setCandidate(null);
      setFirstMove(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const rows = await window.electron.ipc.invoke<Task[]>(
          'tasks:list',
          projectId ? { projectId } : {},
        );
        if (cancelled) return;

        const next = getNextBestMove({
          tasks: rows ?? [],
          statuses: ['backlog', 'active'],
        });
        setCandidate(next.task ? next : null);
        setFirstMove(null);
        if (!next.task) return;

        try {
          const steps = await window.electron.ipc.invoke<TaskStep[]>(
            'tasks:steps-list',
            { taskId: next.task.id },
          );
          if (cancelled) return;
          setFirstMove(
            (steps ?? []).find((step) => step.done === 0)?.title ?? null,
          );
        } catch {
          if (!cancelled) setFirstMove(null);
        }
      } catch {
        if (!cancelled) {
          setCandidate(null);
          setFirstMove(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, version]);

  return { candidate, firstMove, loading };
}
