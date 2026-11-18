/**
 * lib/task-recommendations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, UI-free recommendation engine for the "Next Best Move" flow launcher.
 *
 * Implements an ADHD-friendly momentum heuristic:
 *   1. Prioritizes highest leverage work (P1 > P2 > P3).
 *   2. Reduces activation barrier by favoring short estimates (<= 15-30m)
 *      or tasks that already have partial sub-step progress.
 *   3. Factors in impending due dates / overdue status.
 *   4. Supports deterministic shuffling across candidate tasks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StepProgress, Task } from '@/main/ipc/channels';

export interface TaskRecommendation {
  task: Task | null;
  rationale: string;
  totalCandidates: number;
}

export interface GetRecommendationOptions {
  tasks: Task[];
  stepProgress?: Record<string, StepProgress>;
  shuffleIndex?: number;
  /**
   * Which statuses are worth recommending. Defaults to `['backlog']`, which is
   * the Today launchpad's long-standing behaviour.
   *
   * Ignition passes `['backlog', 'active']`: a task that was started and
   * abandoned is the BEST thing to resume, and the backlog-only filter hid it
   * — so a plan whose tasks had already been opened could not be recommended
   * anywhere in the app.
   */
  statuses?: Task['status'][];
}

export function getNextBestMove({
  tasks,
  stepProgress = {},
  shuffleIndex = 0,
  statuses = ['backlog'],
}: GetRecommendationOptions): TaskRecommendation {
  const candidates = tasks.filter((t) => statuses.includes(t.status));

  if (candidates.length === 0) {
    return {
      task: null,
      rationale: 'Nothing waiting. Brain dump or add a task to get started.',
      totalCandidates: 0,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Score each candidate task
  const scored = candidates.map((task) => {
    let score = 0;

    // 1. Priority weighting
    if (task.priority === 1) score += 1000;
    else if (task.priority === 2) score += 500;
    else score += 100;

    // 2. Partial progress (momentum already underway)
    const prog = stepProgress[task.id];
    if (prog && prog.total > 0 && prog.done > 0) {
      score += 350 * (prog.done / prog.total);
    }

    // 3. Short duration bonus (low activation energy quick wins)
    const est = task.estimate_mins;
    if (est !== null && est !== undefined) {
      if (est <= 15) score += 300;
      else if (est <= 30) score += 200;
      else if (est <= 45) score += 100;
    }

    // 4. Deadline urgency
    if (task.due_at !== null && task.due_at !== undefined) {
      if (task.due_at < nowSec) {
        score += 450; // Overdue
      } else if (task.due_at - nowSec <= 86_400) {
        score += 250; // Due within 24 hours
      }
    }

    return { task, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const safeIndex = Math.abs(shuffleIndex) % scored.length;
  const winner = scored[safeIndex].task;

  // Determine a concise, motivational rationale
  let rationale = 'Top priority task waiting in your backlog';
  const prog = stepProgress[winner.id];
  const isOverdue =
    winner.due_at !== null &&
    winner.due_at !== undefined &&
    winner.due_at < nowSec;

  if (isOverdue) {
    rationale = 'Urgent: overdue task with high impact';
  } else if (prog && prog.done > 0) {
    rationale = `Momentum ready: ${prog.done}/${prog.total} sub-steps already completed`;
  } else if (winner.estimate_mins && winner.estimate_mins <= 15) {
    rationale = `Quick Win (${winner.estimate_mins}m): lowest activation barrier to build flow`;
  } else if (winner.estimate_mins && winner.estimate_mins <= 30) {
    rationale = `Balanced sprint (${winner.estimate_mins}m): high leverage, fast completion`;
  } else if (winner.priority === 1) {
    rationale = 'High priority: essential work to move your project forward';
  }

  return {
    task: winner,
    rationale,
    totalCandidates: scored.length,
  };
}
