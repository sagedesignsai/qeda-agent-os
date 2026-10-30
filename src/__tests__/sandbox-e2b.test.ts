/**
 * __tests__/sandbox-e2b.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The E2B sandbox wrapper is the trust boundary between Qeda and a remote
 * OpenCode server. These tests pin the three things that are easy to regress:
 *
 *   • the template is versioned (OpenCode 2) with a documented fallback,
 *   • the public sandbox URL is protected by both E2B traffic auth and OpenCode
 *     basic auth,
 *   • patches are captured against the session's base commit with `--binary`
 *     and applied only after `git apply --check`.
 *
 * The SDK and fetch are mocked; `git apply` runs against real temporary
 * repositories because the failure mode we care about is git's, not a mock's.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Sandbox } from 'e2b';
import {
  capturePatch,
  createSandbox,
  applyPatchLocally,
} from '@/main/sandbox/e2b';
import { DEFAULT_E2B_SANDBOX_TEMPLATE } from '@/lib/builder-engine';

jest.mock('e2b', () => ({
  Sandbox: { create: jest.fn() },
}));

const createSandboxMock = Sandbox.create as unknown as jest.Mock;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function makeFakeSandbox(options?: {
  revParse?: string;
  diff?: string;
  trafficAccessToken?: string | null;
}) {
  const run = jest.fn(
    async (
      command: string,
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
      if (command.includes('git rev-parse HEAD')) {
        return {
          exitCode: 0,
          stdout: `${options?.revParse ?? 'base-sha'}\n`,
          stderr: '',
        };
      }
      if (command.includes('git diff')) {
        return {
          exitCode: 0,
          stdout: options?.diff ?? '',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  );

  return {
    sandboxId: 'sbx_test',
    trafficAccessToken:
      options?.trafficAccessToken === undefined
        ? 'traffic-token'
        : options.trafficAccessToken,
    commands: { run },
    getHost: jest.fn(() => 'sandbox.example.test'),
    kill: jest.fn(async () => undefined),
  };
}

function jsonResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
  } as unknown as Response;
}

describe('createSandbox', () => {
  const originalKey = process.env.E2B_API_KEY;

  beforeEach(() => {
    process.env.E2B_API_KEY = 'e2b-test-key';
    createSandboxMock.mockReset();
    global.fetch = jest.fn(async () =>
      jsonResponse(),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.E2B_API_KEY;
    } else {
      process.env.E2B_API_KEY = originalKey;
    }
    jest.restoreAllMocks();
  });

  it('uses the pinned OpenCode 2 template and the v2 readiness probe', async () => {
    const fake = makeFakeSandbox();
    createSandboxMock.mockResolvedValue(fake);

    const handle = await createSandbox({
      remoteUrl: 'https://github.com/acme/repo.git',
    });

    expect(createSandboxMock).toHaveBeenCalledTimes(1);
    expect(createSandboxMock.mock.calls[0][0]).toBe(
      DEFAULT_E2B_SANDBOX_TEMPLATE,
    );
    expect(DEFAULT_E2B_SANDBOX_TEMPLATE).toMatch(/opencode:v2\./);
    expect(createSandboxMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        apiKey: 'e2b-test-key',
        network: { allowPublicTraffic: false },
      }),
    );

    const options = createSandboxMock.mock.calls[0][1];
    expect(options.envs.OPENCODE_PASSWORD).toMatch(/^[a-f0-9]{48}$/);
    expect(options.envs.OPENCODE_SERVER_PASSWORD).toBe(
      options.envs.OPENCODE_PASSWORD,
    );
    expect(options.envs.OPENCODE_SERVER_USERNAME).toBeUndefined();

    expect(handle.baseSha).toBe('base-sha');
    expect(handle.template).toBe(DEFAULT_E2B_SANDBOX_TEMPLATE);
    expect(handle.headers['e2b-traffic-access-token']).toBe('traffic-token');
    expect(handle.headers.Authorization).toBe(
      `Basic ${Buffer.from(
        `opencode:${options.envs.OPENCODE_SERVER_PASSWORD}`,
      ).toString('base64')}`,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://sandbox.example.test/api/info',
      expect.objectContaining({ headers: handle.headers }),
    );

    const startCommand = fake.commands.run.mock.calls.find((call) =>
      String(call[0]).includes('serve --hostname'),
    )?.[0];
    expect(startCommand).toContain('opencode2 serve');
    expect(startCommand).toContain('opencode serve');
    expect(startCommand).toContain('> /tmp/opencode-sandbox.log 2>&1');
  });

  it('honours an explicit template override', async () => {
    createSandboxMock.mockResolvedValue(makeFakeSandbox());

    await createSandbox({
      remoteUrl: 'https://github.com/acme/repo.git',
      template: 'acme/opencode:v2.9.0',
    });

    expect(createSandboxMock.mock.calls[0][0]).toBe('acme/opencode:v2.9.0');
  });

  it('falls back to the bare opencode template when the alias is missing', async () => {
    createSandboxMock
      .mockRejectedValueOnce(new Error('template not found'))
      .mockResolvedValueOnce(makeFakeSandbox());

    const handle = await createSandbox({
      remoteUrl: 'https://github.com/acme/repo.git',
    });

    expect(createSandboxMock).toHaveBeenCalledTimes(2);
    expect(createSandboxMock.mock.calls[0][0]).toBe(
      DEFAULT_E2B_SANDBOX_TEMPLATE,
    );
    expect(createSandboxMock.mock.calls[1][0]).toBe('opencode');
    expect(handle.template).toBe('opencode');
  });

  it('omits the traffic header when E2B returns no access token', async () => {
    createSandboxMock.mockResolvedValue(
      makeFakeSandbox({ trafficAccessToken: null }),
    );

    const handle = await createSandbox({
      remoteUrl: 'https://github.com/acme/repo.git',
    });

    expect(handle.headers['e2b-traffic-access-token']).toBeUndefined();
    expect(handle.headers.Authorization).toMatch(/^Basic /);
  });
});

describe('capturePatch', () => {
  it('diffs the staged tree against the session base commit with --binary', async () => {
    const fake = makeFakeSandbox({ diff: 'diff --git a/a.txt b/a.txt' });

    const patch = await capturePatch(
      fake as unknown as Sandbox,
      '/home/user/repo',
      'base-sha',
    );

    const commands = fake.commands.run.mock.calls.map((call) =>
      String(call[0]),
    );
    expect(commands).toEqual([
      'cd "/home/user/repo" && git add -A',
      'cd "/home/user/repo" && git diff --binary --cached "base-sha"',
      'cd "/home/user/repo" && git reset -q HEAD',
    ]);
    expect(patch).toBe('diff --git a/a.txt b/a.txt');
  });

  it('still resets the index when the diff command fails', async () => {
    const run = jest.fn(async (command: string) => {
      if (command.includes('git diff')) {
        return { exitCode: 1, stdout: '', stderr: 'boom' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await expect(
      capturePatch(
        { commands: { run } } as unknown as Sandbox,
        '/repo',
        'base-sha',
      ),
    ).rejects.toThrow(/Failed to capture diff/);

    expect(run.mock.calls.map((call) => String(call[0]))).toContain(
      'cd "/repo" && git reset -q HEAD',
    );
  });
});

describe('applyPatchLocally', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-patch-repo-'));
    git(['init', '-b', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'hello.txt'), 'hello\n', 'utf8');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'initial'], repo);
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  function makePatch(): string {
    fs.writeFileSync(path.join(repo, 'hello.txt'), 'hello world\n', 'utf8');
    const patch = git(['diff', '--binary'], repo);
    git(['checkout', '--', 'hello.txt'], repo);
    return patch;
  }

  it('checks and applies a binary-safe patch', async () => {
    const patch = makePatch();

    const result = await applyPatchLocally(repo, patch);

    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(repo, 'hello.txt'), 'utf8')).toBe(
      'hello world\n',
    );
  });

  it('leaves the tree untouched and saves the patch when it cannot apply', async () => {
    const patch = makePatch();
    // Move the target so the patch no longer matches the local tree.
    fs.writeFileSync(path.join(repo, 'hello.txt'), 'different\n', 'utf8');

    const result = await applyPatchLocally(repo, patch);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.savedPath).toBeTruthy();
    expect(fs.existsSync(result.savedPath as string)).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'hello.txt'), 'utf8')).toBe(
      'different\n',
    );
  });

  it('treats an empty patch as a no-op', async () => {
    await expect(applyPatchLocally(repo, '  \n')).resolves.toEqual({
      ok: true,
    });
  });
});
