/**
 * lib/builder-preview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The shared contract for the Builder's preview process, plus every *pure*
 * decision behind it: which package script to run, which package manager to run
 * it with, and which local URL the activity feed is currently advertising.
 *
 * WHY THIS IS SHARED AND ELECTRON-FREE
 * ────────────────────────────────────
 * The renderer needs the shapes, main needs the process, and both have to agree
 * on what "ready" means. Keeping the decisions here — instead of inside
 * `main/builder/preview.ts` — means the interesting parts (script selection, the
 * package-manager precedence, "did the newest tool output announce a URL?") are
 * testable against plain data, with no child process and no Electron.
 *
 * OWNERSHIP IS EXPLICIT, NOT IMPLIED
 * ──────────────────────────────────
 * A dev server can be started by Qeda *or* by the agent during a turn, and only
 * the first of those can be killed. The status therefore carries who owns the
 * process: `'qeda'` means we spawned it and are responsible for cleaning it up;
 * `'detected'` means the agent's own output advertised it and we must never
 * touch it. A surface that cannot tell those two apart will eventually kill a
 * process it did not start.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { extractLocalhostUrls } from './terminal-input';
import type { BuilderSessionEvent } from './builder-session';

/** Who owns the process a status describes. */
export type BuilderPreviewOwner = 'qeda' | 'detected';

export type BuilderPreviewState =
  /** Nothing has been started. */
  | 'idle'
  /** Spawned, but no local URL has been announced yet. */
  | 'starting'
  /** A local URL was announced; the canvas can load it. */
  | 'ready'
  /** The process ended, cleanly or otherwise. */
  | 'exited'
  /** Could not start at all (no script, no package.json, spawn failure). */
  | 'error';

export interface BuilderPreviewStatus {
  state: BuilderPreviewState;
  /** Owner of the process, or null when nothing is running. */
  owner: BuilderPreviewOwner | null;
  /** Absolute local URL the server announced, when it has. */
  url: string | null;
  /** The exact command Qeda ran, or null for a detected-only preview. */
  command: string | null;
  /** Workspace the process was started in. */
  directory: string | null;
  /** Tail of the process log. Capped; oldest lines drop first. */
  log: string[];
  exitCode: number | null;
  /** Human-readable explanation for every non-ready state. */
  message: string | null;
}

export const EMPTY_PREVIEW_STATUS: BuilderPreviewStatus = {
  state: 'idle',
  owner: null,
  url: null,
  command: null,
  directory: null,
  log: [],
  exitCode: null,
  message: null,
};

/** How much of the process log is kept. Enough to debug, bounded on purpose. */
export const MAX_PREVIEW_LOG_LINES = 300;

/**
 * Script names to look for, most specific first.
 *
 * `dev` wins because every modern scaffold (Vite, Next, Astro, Nuxt, Remix)
 * uses it for the hot-reloading server, which is the thing a preview wants.
 * `start` is last: it is what CRA and bare Express apps use, but it is also the
 * name a production/`node` entry point often takes, so it is only reached when
 * nothing better exists.
 */
export const PREVIEW_SCRIPT_NAMES = ['dev', 'serve', 'develop', 'start'] as const;

/** The script to run for a preview, or null when the package has none. */
export function choosePreviewScript(
  scripts: Record<string, string> | undefined | null,
): string | null {
  if (!scripts) return null;
  for (const name of PREVIEW_SCRIPT_NAMES) {
    const value = scripts[name];
    if (typeof value === 'string' && value.trim() !== '') return name;
  }
  return null;
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Lockfile → manager, in precedence order.
 *
 * The order matters when a repo has more than one lockfile during a migration:
 * the first entry present wins, so the more specific/specialised manager beats
 * the generic `package-lock.json` that `npm install` may have left behind.
 */
export const LOCKFILE_ORDER: ReadonlyArray<{
  file: string;
  manager: PackageManager;
}> = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'package-lock.json', manager: 'npm' },
];

/** Pick the package manager from the lockfiles present in a workspace. */
export function detectPackageManager(entries: string[]): PackageManager {
  const present = new Set(entries);
  for (const { file, manager } of LOCKFILE_ORDER) {
    if (present.has(file)) return manager;
  }
  // No lockfile at all: npm is the safe default because every manager can run
  // an npm-shaped script, and `npm` is the one guaranteed to be on PATH with it.
  return 'npm';
}

/**
 * The argv for running a script. Deliberately structured — never a shell
 * string — so a hostile script name can never become a second command.
 */
export function previewArgv(
  manager: PackageManager,
  script: string,
): { command: string; args: string[] } {
  return { command: manager, args: ['run', script] };
}

/**
 * The most recent local URL advertised by the agent's own tool output.
 *
 * This is the always-on half of the preview: a dev server the agent started
 * inside a turn announces itself in a `tool-completed` payload, and scanning
 * backwards finds the newest one. Returns null when nothing has been announced,
 * so the caller can distinguish "no preview" from "preview at <url>".
 */
export function latestLocalUrl(events: BuilderSessionEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'tool-completed') {
      const urls = extractLocalhostUrls(event.output);
      if (urls.length > 0) return urls[urls.length - 1];
    } else if (event.type === 'tool-failed') {
      // A server that logs its URL to stderr and then dies still announced one.
      const urls = extractLocalhostUrls(event.error);
      if (urls.length > 0) return urls[urls.length - 1];
    }
  }
  return null;
}
