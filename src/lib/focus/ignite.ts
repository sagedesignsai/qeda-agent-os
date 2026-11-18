/**
 * lib/focus/ignite.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One tap, from anywhere, into a running focus session.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Focus was reachable only through its own page: the full-screen overlay is
 * rendered by `Tasks.tsx`, so the real entry point was `/tasks` → Today →
 * Start Flow → pick a workspace → press play. Everything expensive — the
 * ticker, XP, OS notifications, the power blocker and the audio scene ritual —
 * already lives in `FocusRuntime`, mounted once by `AppLayout`. Only the
 * *entrance* was page-bound, and a plan made in Chat or on a project page had
 * no way in. That is the gap this closes.
 *
 * THE TWO RULES
 * ─────────────
 * 1. `displayMode` is `'sidebar'`, never `'modal'`. Only `/tasks` renders the
 *    overlay, and `FocusRuntime` only parks a stray `'modal'` on a *pathname
 *    change* — so igniting from `/projects` with `'modal'` would leave a dead
 *    state with nothing on screen. The rail is already on every page.
 * 2. The clock starts here. `startTaskInWorkspace('focus')` deliberately
 *    leaves the timer idle, because pressing play is meant to be the
 *    commitment. Ignition IS the commitment, so there is no "ready" state to
 *    second-guess — the user can pause immediately, but they never have to
 *    press play.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Task } from '@/main/ipc/channels';
import { useFocusStore } from '@/stores/focus-store';
import { XP_REWARDS } from '@/lib/gamification';
import { localDayKey } from './daily-key';
import {
  IGNITION_PRESET_INDEX,
  presetAt,
  presetIndexForWorkMinutes,
} from './presets';

export interface IgniteOptions {
  /** Defaults to the short first-step block. */
  presetIndex?: number;
  /** Ledger label, so rail ignitions are distinguishable from other starts. */
  source?: string;
  /**
   * Skip the XP award. Callers that already pay for the start (an
   * agent-driven launch, say) turn this off to avoid double-paying.
   */
  awardXp?: boolean;
}

export interface IgnitionResult {
  task: Task;
  presetIndex: number;
  presetLabel: string;
  /** XP actually awarded by this call (0 when every key was already claimed). */
  xp: number;
  firstOfDay: boolean;
}

/** Award once per key, and report whether this call was the one that paid. */
async function awardOnce(
  amount: number,
  source: string,
  idempotencyKey: string,
  entityId?: string,
): Promise<boolean> {
  try {
    const result = await window.electron.ipc.invoke<{ awarded?: boolean }>(
      'gamification:award-xp',
      { amount, source, entityId, idempotencyKey },
    );
    // An older build may resolve without the flag; treat unknown as paid so
    // the caller's "+15 XP" copy stays honest.
    return result?.awarded !== false;
  } catch {
    return false;
  }
}

/**
 * Start `task` in the rail with the clock already running.
 *
 * Best-effort on every side effect: a failed status write must not stop the
 * timer, and a failed XP call must not stop the session.
 */
export async function igniteTask(
  task: Task,
  options: IgniteOptions = {},
): Promise<IgnitionResult> {
  const presetIndex =
    options.presetIndex ??
    presetIndexForWorkMinutes(presetAt(IGNITION_PRESET_INDEX).work);
  const focus = useFocusStore.getState();

  // Order matters: `setPresetIndex` resets the timer, and `startFocus` derives
  // its durations from the preset in effect at that moment.
  focus.setPresetIndex(presetIndex);
  focus.startFocus(task);
  focus.setDisplayMode('sidebar');
  focus.start();

  // Activation is a status, not a surface. A started task stops being a
  // backlog candidate everywhere else in the app.
  if (task.status !== 'active') {
    try {
      await window.electron.ipc.invoke('tasks:update', {
        id: task.id,
        status: 'active',
      });
    } catch {
      /* the session is already running; the row can catch up later */
    }
  }

  let xp = 0;
  let firstOfDay = false;
  if (options.awardXp !== false) {
    const day = localDayKey();
    const source = options.source ?? 'rail_ignition';
    const started = await awardOnce(
      XP_REWARDS.FLOW_START,
      source,
      `flow_start:${task.id}:${day}`,
      task.id,
    );
    if (started) xp += XP_REWARDS.FLOW_START;
    firstOfDay = await awardOnce(
      XP_REWARDS.FIRST_LIGHT,
      'first_light',
      `first_light:${day}`,
    );
    if (firstOfDay) xp += XP_REWARDS.FIRST_LIGHT;
  }

  return {
    task: { ...task, status: 'active' },
    presetIndex,
    presetLabel: presetAt(presetIndex).label,
    xp,
    firstOfDay,
  };
}

// ─── "Not now" ───────────────────────────────────────────────────────────────
// Rejection is a first-class answer: declining must silence the offer for the
// day rather than re-present the same task on the next route change. The key
// stores the day it was dismissed on, so yesterday's "no" expires by itself.

const SNOOZE_PREFIX = 'qeda:ignition:snooze:';

function snoozeKey(scopeKey: string): string {
  return `${SNOOZE_PREFIX}${scopeKey}`;
}

export function snoozeIgnition(scopeKey: string, day = localDayKey()): void {
  try {
    window.localStorage.setItem(snoozeKey(scopeKey), day);
  } catch {
    /* private mode / no storage: the offer simply stays */
  }
}

export function isIgnitionSnoozed(
  scopeKey: string,
  day = localDayKey(),
): boolean {
  try {
    return window.localStorage.getItem(snoozeKey(scopeKey)) === day;
  } catch {
    return false;
  }
}
