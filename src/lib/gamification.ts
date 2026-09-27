/**
 * lib/gamification.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, UI-free math and domain rules for the Gamification & Dopamine Engine.
 *
 *   • XP curve: balanced progression rewarding both effort and completions
 *   • Rank titles: understated, calm identity badges
 *   • Streak shield rules: forgiving grace mechanics for ADHD users
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GamificationState {
  id: string;
  currentXp: number;
  currentLevel: number;
  streakDays: number;
  streakShields: number;
  lastActiveDay: string;
  /** XP within the current level */
  xpInLevel: number;
  /** XP required to complete the current level */
  xpForNextLevel: number;
  /** Progress 0..1 toward next level */
  progress: number;
  rankTitle: string;
}

export const XP_REWARDS = {
  FOCUS_MINUTE: 2,
  POMODORO_COMPLETE: 50,
  TASK_HIGH: 100,
  TASK_MED: 60,
  TASK_LOW: 30,
  STEP_COMPLETE: 15,
  DAY_PLAN: 40,
} as const;

/** Total cumulative XP required to reach a specific level. */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Level 2: 200, Level 3: 500, Level 4: 900, Level 5: 1400...
  // Cumulative: 100 * (level - 1) * (level + 2) / 2
  return Math.round(50 * (level - 1) * (level + 3));
}

/** Given total XP, compute level and progress within the current level. */
export function calculateLevelFromXp(totalXp: number): {
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  progress: number;
} {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let level = 1;

  while (totalXpForLevel(level + 1) <= safeXp) {
    level += 1;
  }

  const currentLevelBase = totalXpForLevel(level);
  const nextLevelBase = totalXpForLevel(level + 1);
  const xpForNextLevel = nextLevelBase - currentLevelBase;
  const xpInLevel = safeXp - currentLevelBase;
  const progress = Math.min(1, Math.max(0, xpInLevel / xpForNextLevel));

  return {
    level,
    xpInLevel,
    xpForNextLevel,
    progress,
  };
}

/** Understated rank title based on level. */
export function getRankTitle(level: number): string {
  if (level <= 2) return 'Novice';
  if (level <= 4) return 'Focused';
  if (level <= 7) return 'Deep Thinker';
  if (level <= 10) return 'Flow Initiate';
  if (level <= 14) return 'Flow Master';
  return 'Zen Operator';
}
