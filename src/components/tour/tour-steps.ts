/**
 * components/tour/tour-steps.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Spotlight tour step definitions — data only, no logic.
 *
 * Each step targets a CSS selector and provides a title and description.
 * The tour runs once after onboarding to orient the user to the app structure.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface TourStep {
  /** CSS selector for the element to spotlight. */
  target: string;
  /** Short heading shown in the tooltip card. */
  title: string;
  /** One- to two-sentence explanation. */
  description: string;
  /** Where to place the tooltip card relative to the target. */
  placement?: 'top' | 'bottom' | 'right' | 'left';
}

/**
 * First-launch spotlight tour — 4 steps covering the app's structure.
 *
 * Kept short on purpose: research shows tours longer than 4–5 steps see
 * dramatic drop-off. These cover the structural elements without teaching
 * every feature. Per-page contextual hints handle the rest.
 */
export const spotlightTourSteps: TourStep[] = [
  {
    target: '[data-tour="sidebar-rail"]',
    title: 'Your navigation rail',
    description:
      'Every tool in Qeda lives here — Tasks, Chat, Terminal, Studio, and more. Press ⌘B to toggle it.',
    placement: 'right',
  },
  {
    target: '[data-tour="search-button"]',
    title: 'Search anything',
    description:
      'Press ⌘K to open the command palette — search pages, tasks, projects, and settings instantly.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="tasks-page"]',
    title: 'Your home base',
    description:
      'You are on Tasks — your dashboard. See today\'s schedule, overdue items, and focus timer all in one place.',
    placement: 'top',
  },
  {
    target: '[data-tour="new-task-button"]',
    title: 'Get started',
    description:
      'Create a task, schedule it on your calendar, or ask the AI Copilot to plan your day. Everything in Qeda starts with action.',
    placement: 'top',
  },
];
