/**
 * __tests__/gamification-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot XP awards (task/step completion, daily bonuses) carry an
 * idempotency key so a retried IPC call or a second mounted hook cannot farm
 * XP. Repeatable awards (per-minute pomodoro XP) carry no key and must keep
 * accumulating.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { awardXp, getGamificationState } from '../main/db/gamification';

describe('awardXp idempotency', () => {
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

  it('pays a keyed completion exactly once', () => {
    const first = awardXp(100, 'task_p1', 'task-1', 'task_done:task-1');
    expect(first.awarded).toBe(true);
    expect(first.state.currentXp).toBe(100);

    const second = awardXp(100, 'task_p1', 'task-1', 'task_done:task-1');
    expect(second.awarded).toBe(false);
    expect(second.leveledUp).toBe(false);
    expect(second.state.currentXp).toBe(100);
    expect(getGamificationState().currentXp).toBe(100);
  });

  it('keeps unkeyed awards repeatable', () => {
    awardXp(50, 'pomodoro_complete', 'task-1');
    const second = awardXp(50, 'pomodoro_complete', 'task-1');
    expect(second.awarded).toBe(true);
    expect(second.state.currentXp).toBe(100);
  });

  it('treats different keys on the same entity as separate awards', () => {
    awardXp(40, 'ai_day_plan', undefined, 'ai_day_plan:2026-11-06');
    const nextDay = awardXp(
      40,
      'ai_day_plan',
      undefined,
      'ai_day_plan:2026-11-07',
    );
    expect(nextDay.awarded).toBe(true);
    expect(nextDay.state.currentXp).toBe(80);
  });
});
