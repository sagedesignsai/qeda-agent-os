/**
 * lib/terminal-input.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parsing for the terminal composer.
 *
 * The composer accepts two kinds of input and has to decide which is which
 * before anything runs:
 *
 *   "find all files over 10MB"   → a goal for the agent to plan
 *   "!find . -size +10M"         → a command to run directly
 *
 * Both the page (to dispatch) and the input component (to label the composer)
 * need this answer, so it lives here rather than being re-implemented at each
 * call site — duplicated prefix logic is exactly how the two drift apart.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ComposerIntent =
  | { kind: 'goal'; text: string }
  | { kind: 'command'; command: string };

/** Prefixes that switch the composer from "ask the agent" to "run this now". */
const DIRECT_PREFIX = /^[!$]\s?/;

/**
 * Classify composer text.
 *
 * A bare prefix (`!`, `$`, or `! `) carries no command, so it degrades to a
 * goal rather than dispatching an empty command to the shell.
 */
export function parseComposerInput(input: string): ComposerIntent {
  const trimmed = input.trim();
  const match = DIRECT_PREFIX.exec(trimmed);

  if (match) {
    const command = trimmed.slice(match[0].length).trim();
    if (command.length > 0) return { kind: 'command', command };
  }

  return { kind: 'goal', text: trimmed };
}

/** True when the composer will run the text directly rather than plan it. */
export function isDirectCommandInput(input: string): boolean {
  return parseComposerInput(input).kind === 'command';
}

/**
 * Compact human duration for a command block: "412ms", "2.4s", "1m 12s".
 * Sub-minute values keep one decimal because the difference between 1.2s and
 * 1.9s is meaningful when you are comparing runs.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}
