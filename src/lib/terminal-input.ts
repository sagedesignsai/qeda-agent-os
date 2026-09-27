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

/** Regex matching local development server addresses (localhost, 127.0.0.1, 0.0.0.0). */
export const LOCALHOST_REGEX =
  /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[^\s"')\]]*)?)/gi;

/** Extract unique local dev server URLs from stdout/stderr (e.g. Next.js, Vite). */
export function extractLocalhostUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(LOCALHOST_REGEX);
  if (!matches) return [];
  const cleaned = matches.map((u) => u.replace(/[.,;:)\]]+$/, ''));
  return Array.from(new Set(cleaned));
}

/** Detect whether a command or its output represents a unified Git diff. */
export function isGitDiff(cmd?: string, text?: string): boolean {
  if (
    cmd &&
    (cmd.startsWith('git diff') ||
      cmd.startsWith('git show') ||
      cmd.startsWith('git log -p'))
  ) {
    return true;
  }
  if (!text) return false;
  return (
    text.includes('diff --git ') ||
    (text.includes('--- a/') && text.includes('+++ b/'))
  );
}

/** Parse a standard .env file content into key-value pairs without executing code. */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let val = match[2].trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    result[key] = val;
  }
  return result;
}

/** Parse export statements from a command string (e.g. export PORT=3000). */
export function parseExportCommand(command: string): Record<string, string> | null {
  const trimmed = command.trim();
  if (!trimmed.startsWith('export ') && trimmed !== 'export') return null;

  const rest = trimmed.slice(7).trim();
  if (!rest) return null;

  const result: Record<string, string> = {};
  const regex = /([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s;]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rest)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    result[key] = val;
  }

  return Object.keys(result).length > 0 ? result : null;
}

const INTERACTIVE_PATTERNS = [
  /^sudo\b/,
  /^git\s+add\s+-[p|i]\b/,
  /^git\s+commit\s*$/,
  /^npm\s+init(?!\s+-y)\b/,
  /^yarn\s+create\b/,
  /^pnpm\s+create\b/,
  /^(?:nano|vim|vi|emacs|less|more|top|htop)\b/,
  /^(?:python|python3|node|irb|php\s+-a)\s*$/,
  /^ssh\b/,
];

/** Returns true if the command requires an interactive TTY and cannot run cleanly in a subshell pipe. */
export function isInteractiveCommand(command: string): boolean {
  const trimmed = command.trim();
  return INTERACTIVE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

