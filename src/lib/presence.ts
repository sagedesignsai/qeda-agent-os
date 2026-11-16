/**
 * lib/presence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared labels, platform URLs, and greeting copy for the Presence coach.
 *
 * Keeps display strings in one place so the UI, IPC, and AI prompt all read
 * the same names. Platform URLs are used by the System Browser to navigate
 * to the right landing page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Embedded browser ─────────────────────────────────────────────────────────

/**
 * Bounds of the area the Presence page hands to the main process for an
 * embedded `WebContentsView` (Electron DIP, relative to the window content).
 *
 * Renderer sends the measured `getBoundingClientRect()` of the browser pane; the
 * main process places the native view exactly there, so the page can lay out
 * tabs in React while the site itself stays out of the renderer's DOM.
 */
export interface PresenceBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Platforms ────────────────────────────────────────────────────────────────

export const PRESENCE_PLATFORMS = [
  'linkedin',
  'x',
  'facebook',
  'instagram',
  'discord',
  'any',
] as const;

export type PresencePlatform = (typeof PRESENCE_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PresencePlatform, string> = {
  linkedin: 'LinkedIn',
  x: 'X / Twitter',
  facebook: 'Facebook',
  instagram: 'Instagram',
  discord: 'Discord',
  any: 'Any platform',
};

/** Landing-page URLs for the System Browser (presence:open-browser). */
export const PLATFORM_URLS: Record<PresencePlatform, string> = {
  linkedin: 'https://www.linkedin.com',
  x: 'https://x.com',
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  discord: 'https://discord.com/app',
  any: '',
};

// ─── Suggestion kinds ─────────────────────────────────────────────────────────

export const PRESENCE_KINDS = [
  'post_draft',
  'platform_suggestion',
  'connection_suggestion',
  'engagement_prompt',
  'group_suggestion',
] as const;

export type PresenceKind = (typeof PRESENCE_KINDS)[number];

export const KIND_LABELS: Record<PresenceKind, string> = {
  post_draft: 'Post draft',
  platform_suggestion: 'Platform suggestion',
  connection_suggestion: 'Connection',
  engagement_prompt: 'Engagement',
  group_suggestion: 'Group suggestion',
};

// ─── Item statuses ────────────────────────────────────────────────────────────

export const PRESENCE_STATUSES = [
  'pending',
  'done',
  'skipped',
] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  pending: 'Pending',
  done: 'Done',
  skipped: 'Skipped',
};

// ─── Onboarding goals ─────────────────────────────────────────────────────────

export const PRESENCE_GOALS = [
  'personal_brand',
  'business_growth',
  'networking',
  'learning',
] as const;

export type PresenceGoal = (typeof PRESENCE_GOALS)[number];

export const GOAL_LABELS: Record<PresenceGoal, string> = {
  personal_brand: 'Personal brand',
  business_growth: 'Business growth',
  networking: 'Networking',
  learning: 'Learning',
};

// ─── Coach prompts ────────────────────────────────────────────────────────────

/**
 * The instruction the coach receives when the user asks for a new batch.
 *
 * Kept here rather than in the page so the header action, the empty state, and
 * the onboarding finish all produce the same agent turn — the agent is the one
 * that decides what to write; this is only the brief.
 */
export const PRESENCE_GENERATION_PROMPT =
  'Generate a fresh batch of presence suggestions for this project. Mix post drafts, connection ideas, engagement prompts, and platform or group suggestions where they fit. Create the batch and its items with your tools.';

// ─── Calendar helpers ─────────────────────────────────────────────────────────

/**
 * Local calendar date as `YYYY-MM-DD`.
 *
 * Streaks are a human-day concept: activity at 11pm belongs to that local day,
 * not whichever UTC day `toISOString()` happens to report. Shared by the
 * renderer greeting and the main-process streak writer so both agree.
 */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Streak helpers ──────────────────────────────────────────────────────────

/**
 * Derives the current streak count from stored streak data and last_active_date.
 * 
 * The streak is only active if the user acted today or yesterday (local calendar).
 * If the streak was broken (gap of 2+ days), returns 0 for display purposes,
 * while preserving the stored count as "best run" for history.
 */
export function displayStreak(
  storedStreakCount: number,
  lastActiveDate: string | null,
  today: string = localDateString(),
): number {
  if (!lastActiveDate || storedStreakCount === 0) {
    return 0;
  }

  const [year, month, day] = today.split('-').map(Number);
  const yesterday = new Date(year, month - 1, day);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = localDateString(yesterday);

  // Streak is active only if last activity was today or yesterday
  if (lastActiveDate === today || lastActiveDate === yesterdayStr) {
    return storedStreakCount;
  }

  // Streak is broken
  return 0;
}

/**
 * Returns a greeting message based on the user's streak and activity state.
 */
export function getGreetingMessage(
  streakCount: number,
  lastActiveDate: string | null,
  onboardingComplete: boolean,
): string {
  if (!onboardingComplete) {
    return '';
  }

  // Derive the current streak (0 if broken)
  const currentStreak = displayStreak(streakCount, lastActiveDate);

  // Check if the streak is active (last active today or yesterday)
  const todayStr = localDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = localDateString(yesterday);

  if (!lastActiveDate) {
    return 'Ready to start? Here are some ideas.';
  }

  if (lastActiveDate === todayStr) {
    if (currentStreak >= 3) {
      return `You're on a ${currentStreak}-day streak — you're building a habit!`;
    }
    return 'Great start! Keep it going.';
  }

  if (lastActiveDate === yesterdayStr) {
    return "Welcome back! Let's keep the momentum going.";
  }

  // Streak broken
  return "Welcome back! Let's pick up where you left off.";
}

/** Milestone celebration messages for streak days. */
export const MILESTONE_MESSAGES: Record<number, string> = {
  3: "3 days in a row — you're building a habit!",
  7: "Week 1 complete! You're finding your rhythm.",
  14: 'Two weeks! This is becoming part of your routine.',
  30: 'One month! Your social presence is growing.',
};

/** Check if a streak count hits a milestone. */
export function getMilestoneMessage(streakCount: number): string | null {
  if (MILESTONE_MESSAGES[streakCount]) {
    return MILESTONE_MESSAGES[streakCount];
  }
  if (streakCount > 30 && streakCount % 30 === 0) {
    return `${streakCount} days — you're unstoppable!`;
  }
  return null;
}

/** Calculate next milestone target. */
export function nextMilestoneTarget(streakCount: number): number {
  const milestones = [3, 7, 14, 30];
  for (const m of milestones) {
    if (streakCount < m) return m;
  }
  // Beyond 30, next milestone is next 30-day boundary
  return Math.ceil((streakCount + 1) / 30) * 30;
}

/** Calculate progress to next milestone. */
export function milestoneProgress(streakCount: number): {
  current: number;
  target: number;
  percent: number;
} {
  const target = nextMilestoneTarget(streakCount);
  const current = Math.max(0, streakCount);
  return {
    current,
    target,
    percent: Math.min(100, Math.round((current / target) * 100)),
  };
}
