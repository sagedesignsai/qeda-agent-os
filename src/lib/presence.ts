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
  'edited',
] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  pending: 'Pending',
  done: 'Done',
  skipped: 'Skipped',
  edited: 'Edited',
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

// ─── Greeting copy templates ──────────────────────────────────────────────────

/**
 * Returns a greeting message based on the user's streak and activity state.
 */
export function getGreetingMessage(streakCount: number, lastActiveDate: string | null, onboardingComplete: boolean): string {
  if (!onboardingComplete) {
    return '';
  }

  // Check if the streak is active (last active today or yesterday)
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (!lastActiveDate) {
    return 'Ready to start? Here are some ideas.';
  }

  if (lastActiveDate === todayStr) {
    if (streakCount >= 3) {
      return `You're on a ${streakCount}-day streak — you're building a habit!`;
    }
    return 'Great start! Keep it going.';
  }

  if (lastActiveDate === yesterdayStr) {
    return 'Welcome back! Let\'s keep the momentum going.';
  }

  // Streak broken
  return 'Welcome back! Let\'s pick up where you left off.';
}

/** Milestone celebration messages for streak days. */
export const MILESTONE_MESSAGES: Record<number, string> = {
  3: '3 days in a row — you\'re building a habit!',
  7: 'Week 1 complete! You\'re finding your rhythm.',
  14: 'Two weeks! This is becoming part of your routine.',
  30: 'One month! Your social presence is growing.',
};

/** Check if a streak count hits a milestone. */
export function getMilestoneMessage(streakCount: number): string | null {
  return MILESTONE_MESSAGES[streakCount] ?? null;
}
