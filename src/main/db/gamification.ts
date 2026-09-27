/**
 * db/gamification.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite persistence for the Gamification & Dopamine Engine.
 *
 * Tracks cumulative XP, levels, streak shields, and an audit ledger of XP gains.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';
import { dayKey } from './focus-sessions.js';
import {
  calculateLevelFromXp,
  getRankTitle,
  type GamificationState,
} from '../../lib/gamification.js';

interface RawGamificationRow {
  id: string;
  current_xp: number;
  current_level: number;
  streak_days: number;
  streak_shields: number;
  last_active_day: string;
  updated_at: number;
}

function rowToState(row: RawGamificationRow): GamificationState {
  const { level, xpInLevel, xpForNextLevel, progress } = calculateLevelFromXp(
    row.current_xp,
  );

  return {
    id: row.id,
    currentXp: row.current_xp,
    currentLevel: level,
    streakDays: row.streak_days,
    streakShields: row.streak_shields,
    lastActiveDay: row.last_active_day,
    xpInLevel,
    xpForNextLevel,
    progress,
    rankTitle: getRankTitle(level),
  };
}

/** Fetch or initialize the default gamification profile. */
export function getGamificationState(): GamificationState {
  const db = getDb();
  let row = db
    .prepare(`SELECT * FROM gamification_state WHERE id = 'default'`)
    .get() as RawGamificationRow | undefined;

  if (!row) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT OR IGNORE INTO gamification_state
         (id, current_xp, current_level, streak_days, streak_shields, last_active_day, updated_at)
       VALUES ('default', 0, 1, 0, 2, '', ?)`,
    ).run(now);
    row = db
      .prepare(`SELECT * FROM gamification_state WHERE id = 'default'`)
      .get() as RawGamificationRow;
  }

  return rowToState(row);
}

/** Award XP to the user, log to the ledger, and update level. */
export function awardXp(
  amount: number,
  source: string,
  entityId?: string,
): { state: GamificationState; leveledUp: boolean } {
  if (amount <= 0) {
    return { state: getGamificationState(), leveledUp: false };
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const today = dayKey(now);

  const prev = getGamificationState();
  const newXp = prev.currentXp + amount;
  const { level: newLevel } = calculateLevelFromXp(newXp);
  const leveledUp = newLevel > prev.currentLevel;

  // Streak maintenance: check if activity occurred on a new day
  let newStreak = prev.streakDays;
  if (prev.lastActiveDay !== today) {
    if (prev.lastActiveDay === '') {
      newStreak = 1;
    } else {
      // Check if last active was yesterday
      const yesterday = dayKey(now - 86400);
      if (prev.lastActiveDay === yesterday) {
        newStreak += 1;
      }
    }
  }

  const tx = db.transaction(() => {
    // 1. Insert XP ledger entry
    db.prepare(
      `INSERT INTO xp_ledger (id, amount, source, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(nanoid(), amount, source, entityId ?? null, now);

    // 2. Update gamification state
    db.prepare(
      `UPDATE gamification_state
          SET current_xp = ?,
              current_level = ?,
              streak_days = ?,
              last_active_day = ?,
              updated_at = ?
        WHERE id = 'default'`,
    ).run(newXp, newLevel, newStreak, today, now);
  });

  tx();

  return { state: getGamificationState(), leveledUp };
}

/** Consume a streak shield to preserve the streak. */
export function useStreakShield(): GamificationState {
  const db = getDb();
  const current = getGamificationState();
  if (current.streakShields <= 0) return current;

  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE gamification_state
        SET streak_shields = streak_shields - 1,
            updated_at = ?
      WHERE id = 'default'`,
  ).run(now);

  return getGamificationState();
}
