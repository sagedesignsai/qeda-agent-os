/**
 * main/sandbox/e2b.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the E2B SDK behind an injectable surface so Builder can run an
 * OpenCode session inside an ephemeral cloud sandbox.
 *
 * Kept main-only (never imported by renderer). The sandbox object is not
 * serializable across IPC; unit tests import the pure helpers with the SDK
 * mocked.
 *
 * SECURITY
 * ────────
 * The OpenCode server listens on a public E2B host, so it is protected twice:
 * E2B traffic access tokens (public traffic is disabled) and OpenCode HTTP basic
 * auth with a per-session password. OpenCode 2 fixes the basic-auth username to
 * `opencode`; only the password is configurable. The password never leaves this
 * process and is not written to settings or the database.
 *
 * VERSIONING
 * ──────────
 * Qeda's Builder requires an OpenCode 2.x server. The default template is
 * pinned to the v2 runtime; `e2bSandboxTemplate` lets an operator override it.
 * A bare `opencode` fallback is kept for accounts that have not published the
 * versioned alias, but the version check in `connectBuilderRuntime` still
 * rejects a v1 server with an actionable message.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Sandbox } from 'e2b';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { app } from 'electron';
import { DEFAULT_E2B_SANDBOX_TEMPLATE } from '../../lib/builder-engine.js';
import { resolveServiceKey } from '../services/keys.js';

const execFileAsync = promisify(execFile);

export const SANDBOX_REPO_DIR = '/home/user/repo';
export const OPENCODE_PORT = 4096;
export const SANDBOX_SERVER_LOG = '/tmp/opencode-sandbox.log';

export interface E2bSandboxHandle {
  sandbox: Sandbox;
  sandboxId: string;
  baseUrl: string;
  repoDir: string;
  /** HEAD of the cloned repository at session start. Patches diff from here. */
  baseSha: string;
  /** Auth headers for the sandbox OpenCode server (basic + E2B traffic). */
  headers: Record<string, string>;
  template: string;
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
  /** E2B template alias, e.g. `e2b/opencode:v2.0.24`. */
  template?: string;
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

function buildSandboxHeaders(
  password: string,
  trafficAccessToken?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString(
      'base64',
    )}`,
  };
  if (trafficAccessToken) {
    headers['e2b-traffic-access-token'] = trafficAccessToken;
  }
  return headers;
}

function isMissingTemplateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /template/i.test(message) &&
    /(not found|does not exist|404|unknown)/i.test(message)
  );
}

async function createSandboxWithTemplate(
  template: string,
  options: {
    apiKey: string;
    envs: Record<string, string>;
    timeoutMs: number;
  },
): Promise<Sandbox> {
  return Sandbox.create(template, {
    apiKey: options.apiKey,
    envs: options.envs,
    timeoutMs: options.timeoutMs,
    network: { allowPublicTraffic: false },
  });
}

async function waitForOpenCode(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError = 'not ready';

  while (Date.now() < deadline) {
    // OpenCode 2 exposes `/api/info`; some builds also keep the v1
    // `/global/health` endpoint. Accept either, but only a JSON response —
    // the web SPA returns 200 text/html for unknown paths, which is not a
    // healthy API.
    for (const probe of ['/api/info', '/global/health']) {
      try {
        const res = await fetch(`${baseUrl}${probe}`, {
          headers,
          signal: AbortSignal.timeout(3_000),
        });
        const contentType = res.headers.get('content-type') ?? '';
        if (res.ok && contentType.includes('application/json')) return;
        lastError = `${probe}: HTTP ${res.status} ${contentType || 'no content-type'}`;
      } catch (error) {
        lastError = `${probe}: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`OpenCode server did not become ready (${lastError}).`);
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
  let template = input.template?.trim() || DEFAULT_E2B_SANDBOX_TEMPLATE;
  const password = randomBytes(24).toString('hex');

  const envs: Record<string, string> = {
    ...(input.envs ?? {}),
    // OpenCode 2 hardcodes the basic-auth username to `opencode`; only the
    // password is configurable. Set both the v2 name and its legacy alias so
    // pinned and bare templates authenticate the same way.
    OPENCODE_PASSWORD: password,
    OPENCODE_SERVER_PASSWORD: password,
  };
  if (input.githubToken) envs.GITHUB_TOKEN = input.githubToken;
  // Forward the E2B key is not needed inside; opencode calls providers directly.
  // Provider keys are expected to be passed via input.envs.

  let sandbox: Sandbox;
  try {
    sandbox = await createSandboxWithTemplate(template, {
      apiKey,
      envs,
      timeoutMs,
    });
  } catch (error) {
    if (template === 'opencode' || !isMissingTemplateError(error)) {
      throw error;
    }
    // Older E2B accounts may not have the versioned alias. The version check
    // after startup still rejects a v1 server, but this keeps the failure mode
    // in one place instead of failing at template lookup.
    sandbox = await createSandboxWithTemplate('opencode', {
      apiKey,
      envs,
      timeoutMs,
    });
    template = 'opencode';
  }

  const cloneUrl = withGithubToken(input.remoteUrl, input.githubToken);
  const dir = JSON.stringify(repoDir);
  const startCommand = [
    `cd ${dir} &&`,
    'if command -v opencode2 >/dev/null 2>&1; then',
    `opencode2 serve --hostname 0.0.0.0 --port ${OPENCODE_PORT};`,
    'else',
    `opencode serve --hostname 0.0.0.0 --port ${OPENCODE_PORT};`,
    'fi',
    `> ${SANDBOX_SERVER_LOG} 2>&1`,
  ].join(' ');

  let baseSha: string;
  try {
    const cloneResult = await sandbox.commands.run(
      `git clone -- ${JSON.stringify(cloneUrl)} ${JSON.stringify(repoDir)}`,
      { timeoutMs: 300_000 },
    );
    if (cloneResult.exitCode !== 0) {
      throw new Error(
        `Failed to clone repository into sandbox: ${cloneResult.stderr || cloneResult.stdout || 'unknown error'}`,
      );
    }

    const headResult = await sandbox.commands.run(
      `cd ${JSON.stringify(repoDir)} && git rev-parse HEAD`,
      { timeoutMs: 30_000 },
    );
    if (headResult.exitCode !== 0) {
      throw new Error(
        `The repository has no usable HEAD commit: ${headResult.stderr || headResult.stdout || 'unknown error'}`,
      );
    }
    baseSha = headResult.stdout.trim();

    // Start opencode serve in the background. OpenCode 2's CLI may be installed
    // as `opencode2` in E2B's versioned template; fall back to `opencode` for the
    // bare template and older installs.
    await sandbox.commands.run(startCommand, { background: true });
  } catch (error) {
    await sandbox.kill().catch(() => undefined);
    throw error;
  }

  const host = sandbox.getHost(OPENCODE_PORT);
  const baseUrl = `https://${host}`;
  const headers = buildSandboxHeaders(password, sandbox.trafficAccessToken);

  try {
    await waitForOpenCode(baseUrl, headers);
  } catch (error) {
    const log = await sandbox.commands
      .run(`tail -n 80 ${SANDBOX_SERVER_LOG}`, { timeoutMs: 10_000 })
      .catch(() => null);
    const tail = log?.stdout?.trim();
    await sandbox.kill().catch(() => undefined);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${
        tail ? `\n\nSandbox log:\n${tail}` : ''
      }`,
      { cause: error },
    );
  }

  return {
    sandbox,
    sandboxId: sandbox.sandboxId,
    baseUrl,
    repoDir,
    baseSha,
    headers,
    template,
  };
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
  baseSha?: string,
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

  // Diff against the commit the sandbox started from, not HEAD: an agent that
  // commits inside the sandbox would otherwise lose that work. `--binary` keeps
  // binary edits applicable locally.
  const diffTarget = baseSha ? ` ${JSON.stringify(baseSha)}` : '';
  const diff = await sandbox.commands.run(
    `cd ${dir} && git diff --binary --cached${diffTarget}`,
    { timeoutMs: 120_000 },
  );
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

/** Persist a captured sandbox patch under `userData/builder-patches`. */
export async function savePatchFile(patch: string): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'builder-patches');
  await fs.mkdir(dir, { recursive: true });
  const suffix = randomBytes(4).toString('hex');
  const file = path.join(dir, `patch-${Date.now()}-${suffix}.patch`);
  await fs.writeFile(file, patch, 'utf8');
  return file;
}

export async function applyPatchLocally(
  repoDir: string,
  patch: string,
): Promise<ApplyPatchResult> {
  if (!patch || !patch.trim()) return { ok: true };
  const tmpDir = path.join(app.getPath('userData'), 'builder-patches');
  const tmpFile = await savePatchFile(patch);

  // Try git apply. `--check` first so a patch that cannot apply is reported
  // before the working tree is touched.
  try {
    await execFileAsync(
      'git',
      ['apply', '--check', '--binary', '--whitespace=nowarn', tmpFile],
      { cwd: repoDir, timeout: 120_000 },
    );
    await execFileAsync(
      'git',
      ['apply', '--binary', '--whitespace=nowarn', tmpFile],
      { cwd: repoDir, timeout: 120_000 },
    );
    await fs.rm(tmpFile, { force: true }).catch(() => undefined);
    return { ok: true };
  } catch (error) {
    const cause = error as { stderr?: string; message?: string };
    await fs.rm(tmpFile, { force: true }).catch(() => undefined);
    // Persist the patch under userData/builder-patches so the work survives.
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
