/**
 * lib/projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, UI-free project signal logic.
 *
 * The cards and rows want to answer "does this project need attention?" without
 * each surface inventing its own thresholds. The rule lives here once, returns a
 * plain level, and leaves every label/colour decision to the view — so this file
 * imports no React, no Tailwind, and can be unit-tested directly.
 *
 * `lastActivityAt` deliberately ignores reordering (see db/projects.ts), so a
 * project cannot be un-staled by tidying the grid.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ProjectRollup } from '@/main/ipc/channels';

export type ProjectHealthLevel =
  'archived' | 'done' | 'overdue' | 'at-risk' | 'stale' | 'on-track';

/** An open task due within this window puts the project at risk. */
export const AT_RISK_WINDOW_SEC = 7 * 86_400;
/** No task or focus activity for this long marks an active project as stale. */
export const STALE_AFTER_SEC = 14 * 86_400;

/**
 * Classify a project from its rollup.
 *
 * Precedence matters and is deliberate: a finished/archived project is never
 * "at risk", and an *overdue* task is a stronger signal than one merely due
 * soon. Stale is last so it never masks a real due-date problem.
 */
export function projectHealth(
  rollup: ProjectRollup,
  now: number = Math.floor(Date.now() / 1000),
): ProjectHealthLevel {
  const { project } = rollup;

  if (project.status === 'archived') return 'archived';
  if (project.status === 'done') return 'done';
  if (rollup.overdue > 0) return 'overdue';

  const open = rollup.taskActive + rollup.taskBacklog;

  // Urgency comes from the tasks themselves: the soonest open due date inside
  // the window, with work still open to do.
  if (
    rollup.nextDueAt !== null &&
    rollup.nextDueAt <= now + AT_RISK_WINDOW_SEC &&
    open > 0
  ) {
    return 'at-risk';
  }

  if (
    open > 0 &&
    rollup.lastActivityAt !== null &&
    now - rollup.lastActivityAt > STALE_AFTER_SEC
  ) {
    return 'stale';
  }

  return 'on-track';
}
