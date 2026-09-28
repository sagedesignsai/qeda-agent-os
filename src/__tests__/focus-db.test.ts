/**
 * __tests__/focus-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the ADHD focus-system data layer: breakdown steps, time blocks, and
 * focus sessions (including streak computation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createTask, getTask, updateTask } from '../main/db/tasks';
import {
  createStep,
  createSteps,
  listSteps,
  setStepDone,
  deleteStep,
  stepProgress,
  stepProgressMap,
} from '../main/db/task-steps';
import {
  createBlock,
  listBlocks,
  getBlock,
  updateBlock,
  deleteBlock,
} from '../main/db/task-blocks';
import {
  createFocusSession,
  listFocusSessions,
  getFocusStats,
} from '../main/db/focus-sessions';

describe('focus system data layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  // ── tasks: estimate_mins ────────────────────────────────────────────────────

  it('persists and patches a task time estimate', () => {
    const task = createTask({ title: 'Draft proposal', estimate_mins: 90 });
    expect(task.estimate_mins).toBe(90);

    updateTask(task.id, { estimate_mins: 45 });
    expect(getTask(task.id)?.estimate_mins).toBe(45);
  });

  // ── steps ───────────────────────────────────────────────────────────────────

  it('adds, orders, toggles and deletes steps', () => {
    const task = createTask({ title: 'Ship release' });

    const first = createStep({ task_id: task.id, title: 'Write changelog' });
    const second = createStep({ task_id: task.id, title: 'Tag version' });

    expect(listSteps(task.id).map((s) => s.title)).toEqual([
      'Write changelog',
      'Tag version',
    ]);

    setStepDone(first.id, true);
    expect(listSteps(task.id)[0].done).toBe(1);

    deleteStep(second.id);
    expect(listSteps(task.id)).toHaveLength(1);
  });

  it('creates a breakdown in one transaction and reports progress', () => {
    const task = createTask({ title: 'Plan trip' });
    const steps = createSteps(task.id, ['Pick dates', 'Book flights', 'Pack']);

    expect(steps).toHaveLength(3);
    expect(stepProgress(task.id)).toEqual({ total: 3, done: 0 });

    setStepDone(steps[0].id, true);
    setStepDone(steps[1].id, true);
    expect(stepProgress(task.id)).toEqual({ total: 3, done: 2 });
    expect(stepProgressMap()[task.id]).toEqual({ total: 3, done: 2 });
  });

  it('ignores blank step titles', () => {
    const task = createTask({ title: 'Cleanup' });
    expect(createSteps(task.id, ['  ', ''])).toHaveLength(0);
  });

  // ── blocks ──────────────────────────────────────────────────────────────────

  it('joins blocks to their task and filters by window', () => {
    const task = createTask({ title: 'Deep work', estimate_mins: 60 });
    const base = 1_700_000_000;

    createBlock({ task_id: task.id, start_at: base, end_at: base + 3600 });
    createBlock({ title: 'Lunch', start_at: base + 7200, end_at: base + 9000 });

    const all = listBlocks();
    expect(all).toHaveLength(2);
    const linked = all.find((b) => b.task_id === task.id);
    expect(linked?.task_title).toBe('Deep work');
    expect(linked?.task_estimate_mins).toBe(60);

    // Window that only covers the first block.
    const windowed = listBlocks({ from: base, to: base + 1 });
    expect(windowed).toHaveLength(1);
    expect(windowed[0].title).toBe('');
  });

  it('updates and deletes blocks', () => {
    const block = createBlock({
      title: 'Inbox',
      start_at: 100,
      end_at: 200,
    });
    updateBlock(block.id, { status: 'done', title: 'Inbox zero' });
    const reloaded = getBlock(block.id);
    expect(reloaded?.status).toBe('done');
    expect(reloaded?.title).toBe('Inbox zero');

    deleteBlock(block.id);
    expect(getBlock(block.id)).toBeNull();
  });

  // ── focus sessions & stats ──────────────────────────────────────────────────

  /** Local noon `offsetDays` from today, in unix seconds. */
  function noon(offsetDays: number): number {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(12, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  it('counts only completed work sessions toward the streak', () => {
    const task = createTask({ title: 'Study' });

    // Three consecutive days of completed work phases…
    for (const offset of [0, -1, -2]) {
      createFocusSession({
        task_id: task.id,
        kind: 'work',
        planned_sec: 1500,
        actual_sec: 1500,
        completed: true,
        started_at: noon(offset),
      });
    }
    // …plus noise that must not influence the streak.
    createFocusSession({ kind: 'break', completed: true, started_at: noon(0) });
    createFocusSession({
      kind: 'work',
      completed: false,
      actual_sec: 300,
      started_at: noon(0),
    });
    // A gap day (day -4) must not extend the streak past the -2 day.
    createFocusSession({ kind: 'work', completed: true, started_at: noon(-4) });

    const now = noon(0) + 60;
    const stats = getFocusStats(now);

    expect(stats.streakDays).toBe(3);
    // Today: one completed work session (the abandoned one does not count).
    expect(stats.todayWorkSessions).toBe(1);
    // But today's focus time includes the abandoned 300s plus the 1500s.
    expect(stats.todayFocusSec).toBe(1800);
    expect(stats.totalWorkSessions).toBe(4);
  });

  it('keeps a streak alive on a fresh day before the first session', () => {
    createFocusSession({ kind: 'work', completed: true, started_at: noon(-1) });
    createFocusSession({ kind: 'work', completed: true, started_at: noon(-2) });

    // It is now the next morning and nothing has been done yet today.
    const now = noon(0) - 6 * 3600;
    expect(getFocusStats(now).streakDays).toBe(2);
  });

  it('lists sessions within a window', () => {
    createFocusSession({ kind: 'work', completed: true, started_at: 1000 });
    createFocusSession({ kind: 'work', completed: true, started_at: 5000 });

    expect(listFocusSessions({ from: 2000, to: 6000 })).toHaveLength(1);
  });
});
