/**
 * main/sandbox/e2b.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the E2B SDK behind an injectable surface so Builder can run an
 * OpenCode session inside an ephemeral cloud sandbox.
 *
 * Kept main-only (never imported by renderer or tests) to avoid Jest ESM
 * issues; the sandbox object is not serializable across IPC.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Sandbox } from 'e2b';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { resolveServiceKey } from '../services/keys.js';

export const SANDBOX_REPO_DIR = '/home/user/repo';
export const OPENCODE_PORT = 4096;

export interface E2bSandboxHandle {
  sandbox: Sandbox;
  sandboxId: string;
  baseUrl: string;
  repoDir: string;
}

export function resolveE2bKey(): string {
  return resolveServiceKey('e2b');
}

export interface CreateSandboxInput {
  remoteUrl: string;
  githubToken?: string;
  timeoutMs?: number;
  envs?: Record<string, string>;
  repoDir?: string;
}

function withGithubToken(remoteUrl: string, token?: string): string {
  if (!token) return remoteUrl;
  try {
    const url = new URL(remoteUrl);
    if (url.hostname === 'github.com' && url.protocol === 'https:') {
      url.username = 'x-access-token';
      url.password = token;
      return url.toString();
    }
  } catch {
    // fall through
  }
  return remoteUrl;
}

export async function createSandbox(
  input: CreateSandboxInput,
): Promise<E2bSandboxHandle> {
  const apiKey = resolveE2bKey();
  if (!apiKey) {
    throw new Error(
      'E2B is not configured. Add an API key in Settings → Services or set E2B_API_KEY.',
    );
  }

  const repoDir = input.repoDir ?? SANDBOX_REPO_DIR;
  const timeoutMs = input.timeoutMs ?? 3_600_000;

  const envs: Record<string, string> = { ...(input.envs ?? {}) };
  if (input.githubToken) envs.GITHUB_TOKEN = input.githubToken;
  // Forward the E2B key is not needed inside; opencode calls providers directly.
  // Provider keys are expected to be passed via input.envs.

  const sandbox = await Sandbox.create('opencode', {
    apiKey,
    envs,
    timeoutMs,
  });

  const cloneUrl = withGithubToken(input.remoteUrl, input.githubToken);
  const cloneResult = await sandbox.commands.run(
    `git clone -- ${JSON.stringify(cloneUrl)} ${JSON.stringify(repoDir)}`,
    { timeoutMs: 300_000 },
  );
  if (cloneResult.exitCode !== 0) {
    await sandbox.kill().catch(() => undefined);
    throw new Error(
      `Failed to clone repository into sandbox: ${cloneResult.stderr || cloneResult.stdout || 'unknown error'}`,
    );
  }

  // Start opencode serve in the background.
  await sandbox.commands.run(
    `cd ${JSON.stringify(repoDir)} && opencode serve --hostname 0.0.0.0 --port ${OPENCODE_PORT}`,
    { background: true },
  );

  const host = sandbox.getHost(OPENCODE_PORT);
  const baseUrl = `https://${host}`;
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/global/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!ready) {
    await sandbox.kill().catch(() => undefined);
    throw new Error('OpenCode server in sandbox did not become ready in time.');
  }

  return { sandbox, sandboxId: sandbox.sandboxId, baseUrl, repoDir };
}

export async function destroySandbox(
  handleOrSandbox: E2bSandboxHandle | Sandbox,
): Promise<void> {
  const sandbox =
    handleOrSandbox && 'sandbox' in handleOrSandbox
      ? (handleOrSandbox as E2bSandboxHandle).sandbox
      : (handleOrSandbox as Sandbox);
  try {
    await sandbox.kill();
  } catch {
    // never throw
  }
}

export async function capturePatch(
  handleOrSandbox: E2bSandboxHandle | Sandbox,
  repoDir: string,
): Promise<string> {
  const sandbox =
    handleOrSandbox && 'sandbox' in handleOrSandbox
      ? (handleOrSandbox as E2bSandboxHandle).sandbox
      : (handleOrSandbox as Sandbox);
  const dir = JSON.stringify(repoDir);
  const add = await sandbox.commands.run(`cd ${dir} && git add -A`, {
    timeoutMs: 120_000,
  });
  if (add.exitCode !== 0) {
    await sandbox.commands
      .run(`cd ${dir} && git reset -q HEAD`, { timeoutMs: 30_000 })
      .catch(() => undefined);
    throw new Error(
      `Failed to stage changes: ${add.stderr || add.stdout || 'unknown error'}`,
    );
  }
  const diff = await sandbox.commands.run(`cd ${dir} && git diff --cached`, {
    timeoutMs: 120_000,
  });
  await sandbox.commands
    .run(`cd ${dir} && git reset -q HEAD`, { timeoutMs: 30_000 })
    .catch(() => undefined);
  if (diff.exitCode !== 0) {
    throw new Error(
      `Failed to capture diff: ${diff.stderr || diff.stdout || 'unknown error'}`,
    );
  }
  return diff.stdout ?? '';
}

export interface ApplyPatchResult {
  ok: boolean;
  error?: string;
  savedPath?: string;
}

export async function applyPatchLocally(
  repoDir: string,
  patch: string,
): Promise<ApplyPatchResult> {
  if (!patch || !patch.trim()) return { ok: true };
  const tmpDir = path.join(app.getPath('userData'), 'builder-patches');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `patch-${Date.now()}.patch`);
  await fs.writeFile(tmpFile, patch, 'utf8');

  // Try git apply.
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync(
      'git',
      ['apply', '--binary', '--whitespace=nowarn', tmpFile],
      { cwd: repoDir, timeout: 120_000 },
    );
    await fs.rm(tmpFile, { force: true }).catch(() => undefined);
    return { ok: true };
  } catch (error) {
    const cause = error as { stderr?: string; message?: string };
    // Persist patch under userData/builder-patches/
    const savedPath = path.join(tmpDir, `failed-${Date.now()}.patch`);
    await fs.writeFile(savedPath, patch, 'utf8').catch(() => undefined);
    return {
      ok: false,
      error: (cause.stderr || cause.message || 'git apply failed').trim(),
      savedPath,
    };
  }
}

export async function resolveSourceRemoteUrl(input: {
  remoteUrl?: string;
  directory?: string;
  codeProjectId?: string;
}): Promise<string> {
  if (input.remoteUrl && input.remoteUrl.trim()) {
    // validate via code-projects helper? inline basic
    return input.remoteUrl.trim();
  }
  // Fallback: try git origin of directory
  if (input.directory) {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync(
        'git',
        ['remote', 'get-url', 'origin'],
        { cwd: input.directory, timeout: 30_000 },
      );
      const url = stdout.trim();
      if (url) return url;
    } catch {
      // ignore
    }
  }
  throw new Error(
    'No remote URL available. Provide remoteUrl or link a CodeProject with a remote.',
  );
}
