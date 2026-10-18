/**
 * main/builder/code-projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe filesystem provisioning for Project-linked Builder codebases. All Git
 * execution uses argv (never a shell); a destination is created only after
 * validating its name, parent, and source URL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { inspectBuilderWorkspace } from './workspace.js';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 256 * 1024;

async function runGit(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
      },
    });
    return stdout.trim();
  } catch (error) {
    const cause = error as { stderr?: string; message?: string };
    throw new Error(
      (cause.stderr || cause.message || 'Git command failed.').trim(),
      { cause: error },
    );
  }
}

function safeDirectoryName(name: string): string {
  const normalized = name.trim().replaceAll(/[^a-zA-Z0-9._-]+/g, '-');
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('Enter a project folder name using letters or numbers.');
  }
  return normalized;
}

function validateRemoteUrl(remoteUrl: string): string {
  const value = remoteUrl.trim();
  if (!value || /[\r\n\0]/.test(value)) {
    throw new Error('Enter a valid Git repository URL.');
  }

  // Support HTTPS, SSH URLs, and Git's standard user@host:path form. Reject
  // embedded HTTPS credentials because they can leak into errors and history.
  const https = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[\w./-]+(?:\.git)?$/i;
  const ssh = /^ssh:\/\/[\w.-]+@[a-z0-9.-]+(?::\d+)?\/[\w./-]+(?:\.git)?$/i;
  const scp = /^[\w.-]+@[a-z0-9.-]+:[\w./-]+(?:\.git)?$/i;
  if (!https.test(value) && !ssh.test(value) && !scp.test(value)) {
    throw new Error(
      'Use an HTTPS or SSH Git URL without embedded credentials. Local paths are not supported for cloning.',
    );
  }
  return value;
}

async function resolveParent(parentDirectory: string): Promise<string> {
  const parent = await fs.realpath(path.resolve(parentDirectory));
  const stat = await fs.stat(parent);
  if (!stat.isDirectory()) throw new Error('Choose an existing parent folder.');
  return parent;
}

function destinationWithin(parent: string, name: string): string {
  const destination = path.resolve(parent, safeDirectoryName(name));
  if (path.dirname(destination) !== parent) {
    throw new Error(
      'The project folder must be directly inside the chosen folder.',
    );
  }
  return destination;
}

export async function createGitCodeProjectDirectory(input: {
  parentDirectory: string;
  name: string;
}): Promise<{ directory: string; name: string }> {
  const parent = await resolveParent(input.parentDirectory);
  const name = safeDirectoryName(input.name);
  const directory = destinationWithin(parent, name);
  await fs.mkdir(directory, { recursive: false });
  try {
    const workspace = await inspectBuilderWorkspace(directory, {
      autoInit: true,
    });
    return { directory: workspace.directory, name };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function cloneGitCodeProject(input: {
  parentDirectory: string;
  name: string;
  remoteUrl: string;
}): Promise<{ directory: string; name: string; remoteUrl: string }> {
  const parent = await resolveParent(input.parentDirectory);
  const name = safeDirectoryName(input.name);
  const directory = destinationWithin(parent, name);
  const remoteUrl = validateRemoteUrl(input.remoteUrl);
  const staging = path.join(parent, `.qeda-clone-${randomUUID()}`);

  try {
    await runGit(['clone', '--', remoteUrl, staging]);
    await inspectBuilderWorkspace(staging);
    // Rename is atomic on the same filesystem and fails rather than replacing
    // a destination another process created while the clone was running.
    await fs.rename(staging, directory);
    return { directory: await fs.realpath(directory), name, remoteUrl };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
