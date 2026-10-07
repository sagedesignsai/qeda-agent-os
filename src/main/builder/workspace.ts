/**
 * main/builder/workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the directory a Builder session is bound to before any coding turn
 * can run against it.
 *
 * WHY THIS EXISTS
 * ───────────────
 * OpenCode falls back to an ambient working directory when a session is created
 * without an explicit location. That default is the wrong place to run an agent
 * that can write files and execute commands, so Builder refuses to create a
 * session until it can name a real, canonical, git-backed directory. Git is a
 * hard requirement: without it there is no reviewable unit and no honest way to
 * discard a run's changes.
 *
 * This module is deliberately Electron-free and free of the OpenCode client, so
 * it can be unit-tested against a temp fixture repository.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { BuilderWorkspace } from '../../lib/builder-workspace';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const MAX_GIT_OUTPUT = 64 * 1024;

interface GitResult {
  success: boolean;
  stdout: string;
  stderr?: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT,
      encoding: 'utf8',
      // Never let git page or prompt: this is a background validation.
      env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
    });
    return { success: true, stdout };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: e.stdout ?? '',
      stderr: (e.stderr || e.message || String(error)).trim(),
    };
  }
}

/**
 * Resolve `directory` to a canonical git repository root and inspect it.
 *
 * Throws an actionable error — never returns a placeholder — when the path is
 * missing, not a directory, or not inside a git repository. The caller surfaces
 * that message verbatim, so it is written for the user, not the log.
 */
export async function inspectBuilderWorkspace(
  directory: string,
): Promise<BuilderWorkspace> {
  if (typeof directory !== 'string' || directory.trim() === '') {
    throw new Error('Choose a project folder before starting a build.');
  }

  const input = path.resolve(directory);
  let stat;
  try {
    stat = await fs.stat(input);
  } catch {
    throw new Error(`That folder does not exist: ${directory}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`That path is not a folder: ${directory}`);
  }

  // --show-toplevel works from any subdirectory (and from a worktree, where
  // `.git` is a file rather than a directory), so it is more reliable than
  // testing for a `.git` entry by hand.
  const toplevel = await git(input, ['rev-parse', '--show-toplevel']);
  if (!toplevel.success) {
    throw new Error(
      `"${directory}" is not a git repository. Builder needs git so each run can be reviewed and discarded safely.`,
    );
  }

  let root: string;
  try {
    root = await fs.realpath(toplevel.stdout.trim());
  } catch {
    throw new Error(`Could not resolve the repository root for ${directory}.`);
  }

  const branchResult = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.success ? branchResult.stdout.trim() : '';

  const statusResult = await git(root, ['status', '--porcelain']);
  const changedFileCount = statusResult.success
    ? statusResult.stdout.split('\n').filter((line) => line.trim() !== '').length
    : 0;

  return {
    directory: root,
    name: path.basename(root),
    // `--abbrev-ref HEAD` prints the literal "HEAD" on a detached HEAD.
    branch: branch && branch !== 'HEAD' ? branch : null,
    dirty: changedFileCount > 0,
    changedFileCount,
  };
}
