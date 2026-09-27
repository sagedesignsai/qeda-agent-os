/**
 * ai/shell-env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shell environment, path resolution, and runtime helpers:
 *   1. Captures user's interactive login environment ($SHELL, $PATH from dotfiles).
 *   2. Automatically injects project-local binary paths (node_modules/.bin, .venv/bin).
 *   3. Parses and merges local .env files safely.
 *   4. Tracks session-level environment variables (export KEY=val).
 *   5. Detects interactive commands requiring a TTY (sudo, git add -p, vim, etc).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let cachedLoginEnv: Record<string, string> | null = null;

/**
 * Return the user's configured default shell executable.
 */
export function getShellExecutable(): string {
  if (process.platform === 'win32') {
    return process.env.SHELL ?? 'powershell.exe';
  }
  return process.env.SHELL ?? '/bin/bash';
}

/**
 * Resolve the user's interactive login environment ($SHELL -ilc 'env').
 * Caches the result in memory for fast command spawning.
 */
export function getLoginEnvironment(): Record<string, string> {
  if (cachedLoginEnv) return cachedLoginEnv;

  const baseEnv: Record<string, string> = { ...(process.env as Record<string, string>) };

  if (process.platform === 'win32') {
    cachedLoginEnv = baseEnv;
    return baseEnv;
  }

  const shellBin = getShellExecutable();
  try {
    // Run login + interactive shell to capture PATH from .bashrc, .zshrc, .profile
    const output = execSync(`${shellBin} -ilc 'env'`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });

    const parsed: Record<string, string> = {};
    for (const line of output.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key && !key.startsWith('_')) {
          parsed[key] = val;
        }
      }
    }

    // Merge: login env takes precedence for PATH and tool-specific variables
    cachedLoginEnv = { ...baseEnv, ...parsed };
    return cachedLoginEnv;
  } catch {
    // Fallback to process.env if login shell query times out or fails
    cachedLoginEnv = baseEnv;
    return baseEnv;
  }
}

/** Reset the cached login environment (useful for unit testing). */
export function resetCachedLoginEnv(): void {
  cachedLoginEnv = null;
}

import {
  parseDotEnv,
  parseExportCommand,
  isInteractiveCommand,
} from '../../lib/terminal-input.js';

export { parseDotEnv, parseExportCommand, isInteractiveCommand };

/**
 * Read and parse .env from cwd if present.
 */
export function loadProjectDotEnv(cwd?: string): Record<string, string> {
  if (!cwd) return {};
  try {
    const envPath = path.join(cwd, '.env');
    if (fs.existsSync(envPath) && fs.statSync(envPath).isFile()) {
      const content = fs.readFileSync(envPath, 'utf-8');
      return parseDotEnv(content);
    }
  } catch {}
  return {};
}

import { getTerminalSession, updateTerminalSession } from '../db/terminal.js';

/**
 * In-memory store for session environment variables set via `export KEY=VAL`.
 */
const sessionEnvStore = new Map<string, Record<string, string>>();

export function getSessionEnv(sessionId: string): Record<string, string> {
  let env = sessionEnvStore.get(sessionId);
  if (!env) {
    try {
      const session = getTerminalSession(sessionId);
      if (session?.env) {
        env = JSON.parse(session.env);
        if (env) {
          sessionEnvStore.set(sessionId, env);
        }
      }
    } catch {
      // In unit tests or before DB initialization
    }
  }
  return env ?? {};
}

export function setSessionEnvVar(sessionId: string, key: string, value: string): void {
  const current = { ...getSessionEnv(sessionId) };
  current[key] = value;
  sessionEnvStore.set(sessionId, current);
  try {
    updateTerminalSession(sessionId, { env: JSON.stringify(current) });
  } catch {
    // In unit tests or before DB initialization
  }
}

export function clearSessionEnv(sessionId: string): void {
  sessionEnvStore.delete(sessionId);
  try {
    updateTerminalSession(sessionId, { env: '{}' });
  } catch {}
}

/**
 * Build the full execution environment for a command in a session:
 *   1. Base login shell environment ($PATH with nvm, pnpm, cargo, brew, pyenv)
 *   2. Project .env variables
 *   3. Session-specific exports (export KEY=val)
 *   4. Project-local binary paths (.venv/bin, node_modules/.bin) prepended to PATH
 */
export function buildExecutionEnv(
  sessionId?: string,
  cwd?: string,
): Record<string, string> {
  const loginEnv = getLoginEnvironment();
  const projectEnv = cwd ? loadProjectDotEnv(cwd) : {};
  const sessionEnv = sessionId ? getSessionEnv(sessionId) : {};

  const merged: Record<string, string> = {
    ...loginEnv,
    ...projectEnv,
    ...sessionEnv,
  };

  if (cwd) {
    const pathEntries: string[] = [];

    // Prepend node_modules/.bin if present
    const nodeBin = path.join(cwd, 'node_modules', '.bin');
    if (fs.existsSync(nodeBin)) {
      pathEntries.push(nodeBin);
    }

    // Prepend Python virtualenv if present (.venv/bin or venv/bin)
    const dotVenv = path.join(cwd, '.venv');
    const venv = path.join(cwd, 'venv');
    if (fs.existsSync(path.join(dotVenv, 'bin'))) {
      pathEntries.push(path.join(dotVenv, 'bin'));
      merged.VIRTUAL_ENV = dotVenv;
    } else if (fs.existsSync(path.join(venv, 'bin'))) {
      pathEntries.push(path.join(venv, 'bin'));
      merged.VIRTUAL_ENV = venv;
    }

    if (pathEntries.length > 0) {
      const currentPath = merged.PATH || process.env.PATH || '';
      merged.PATH = `${pathEntries.join(path.delimiter)}${path.delimiter}${currentPath}`;
    }
  }

  return merged;
}
