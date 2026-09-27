/**
 * __tests__/gamification.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the ADHD-first Gamification & Dopamine Engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  calculateLevelFromXp,
  getRankTitle,
  XP_REWARDS,
} from '@/lib/gamification';

describe('Gamification Engine', () => {
  describe('calculateLevelFromXp', () => {
    it('starts at level 1 with 0 XP', () => {
      const calc = calculateLevelFromXp(0);
      expect(calc.level).toBe(1);
      expect(calc.xpInLevel).toBe(0);
      expect(calc.xpForNextLevel).toBeGreaterThan(0);
      expect(calc.progress).toBe(0);
    });

    it('levels up as XP thresholds are crossed', () => {
      const lvl1 = calculateLevelFromXp(0);
      const nextThreshold = lvl1.xpForNextLevel;

      // Crossing the threshold should yield level 2
      const lvl2 = calculateLevelFromXp(nextThreshold + 10);
      expect(lvl2.level).toBe(2);
      expect(lvl2.xpInLevel).toBe(10);
      expect(lvl2.progress).toBeGreaterThan(0);
    });

    it('handles negative or zero XP gracefully', () => {
      const calcNeg = calculateLevelFromXp(-50);
      expect(calcNeg.level).toBe(1);
      expect(calcNeg.xpInLevel).toBe(0);
    });
  });

  describe('getRankTitle', () => {
    it('returns appropriate titles for level milestones', () => {
      expect(getRankTitle(1)).toBe('Novice');
      expect(getRankTitle(3)).toBe('Focused');
      expect(getRankTitle(6)).toBe('Deep Thinker');
      expect(getRankTitle(9)).toBe('Flow Initiate');
      expect(getRankTitle(12)).toBe('Flow Master');
      expect(getRankTitle(20)).toBe('Zen Operator');
    });
  });

  describe('XP Economy', () => {
    it('maintains expected positive dopamine reward values', () => {
      expect(XP_REWARDS.FOCUS_MINUTE).toBe(2);
      expect(XP_REWARDS.TASK_HIGH).toBe(100);
      expect(XP_REWARDS.TASK_MED).toBe(60);
      expect(XP_REWARDS.TASK_LOW).toBe(30);
      expect(XP_REWARDS.STEP_COMPLETE).toBe(15);
      expect(XP_REWARDS.DAY_PLAN).toBe(40);
      expect(XP_REWARDS.POMODORO_COMPLETE).toBe(50);
    });
  });
});
