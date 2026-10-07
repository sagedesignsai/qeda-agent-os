/**
 * __tests__/builder-preview.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The preview has two halves, and both are covered here:
 *
 *   • the *decisions* — which script to run, which package manager to run it
 *     with, and which URL the agent's own output is advertising. Pure functions
 *     against plain data.
 *   • the *process* — a real dev-server spawn. The point of the class is that a
 *     forking server is fully killed on stop, so the assertion that matters is
 *     that the grandchild's pid is gone afterwards. A fake spawn would have
 *     proved nothing about the one bug this code exists to prevent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BuilderPreview } from '@/main/builder/preview';
import {
  choosePreviewScript,
  detectPackageManager,
  latestLocalUrl,
  previewArgv,
  type BuilderPreviewStatus,
} from '@/lib/builder-preview';
import type { BuilderSessionEvent } from '@/lib/builder-session';

describe('choosePreviewScript', () => {
  it('prefers dev over the other scaffolds', () => {
    expect(choosePreviewScript({ start: 'next start', dev: 'next dev' })).toBe(
      'dev',
    );
  });

  it('falls back through serve, develop and start', () => {
    expect(choosePreviewScript({ start: 'node server.js' })).toBe('start');
    expect(choosePreviewScript({ serve: 'vite preview' })).toBe('serve');
    expect(choosePreviewScript({ develop: 'shopify theme dev' })).toBe(
      'develop',
    );
  });

  it('ignores blank scripts and missing ones', () => {
    expect(choosePreviewScript({ dev: '   ' })).toBeNull();
    expect(choosePreviewScript({ build: 'vite build' })).toBeNull();
    expect(choosePreviewScript(undefined)).toBeNull();
  });
});

describe('detectPackageManager', () => {
  it('reads the lockfile', () => {
    expect(detectPackageManager(['pnpm-lock.yaml'])).toBe('pnpm');
    expect(detectPackageManager(['yarn.lock'])).toBe('yarn');
    expect(detectPackageManager(['bun.lockb'])).toBe('bun');
    expect(detectPackageManager(['package-lock.json'])).toBe('npm');
  });

  it('prefers the specialised manager when a migration left two lockfiles', () => {
    expect(
      detectPackageManager(['package-lock.json', 'pnpm-lock.yaml']),
    ).toBe('pnpm');
  });

  it('defaults to npm with no lockfile at all', () => {
    expect(detectPackageManager(['src', 'README.md'])).toBe('npm');
  });
});

describe('previewArgv', () => {
  it('never builds a shell string', () => {
    expect(previewArgv('npm', 'dev')).toEqual({
      command: 'npm',
      args: ['run', 'dev'],
    });
  });

  it('keeps a script name as a single argv entry', () => {
    // A hostile name must never become a second command.
    const { args } = previewArgv('npm', 'dev; rm -rf /');
    expect(args).toEqual(['run', 'dev; rm -rf /']);
  });
});

describe('latestLocalUrl', () => {
  const event = (
    partial: Partial<BuilderSessionEvent>,
  ): BuilderSessionEvent =>
    ({
      sessionId: 'ses_1',
      eventId: Math.random().toString(36).slice(2),
      createdAt: 1,
      ...partial,
    }) as BuilderSessionEvent;

  it('returns the newest announced address', () => {
    expect(
      latestLocalUrl([
        event({
          type: 'tool-completed',
          callId: 'a',
          output: 'Local: http://localhost:3000',
        }),
        event({
          type: 'tool-completed',
          callId: 'b',
          output: 'ready at http://localhost:5173/',
        }),
      ]),
    ).toBe('http://localhost:5173/');
  });

  it('reads a URL off stderr output too', () => {
    expect(
      latestLocalUrl([
        event({
          type: 'tool-failed',
          callId: 'a',
          error: 'EADDRINUSE while starting http://127.0.0.1:8080',
        }),
      ]),
    ).toBe('http://127.0.0.1:8080');
  });

  it('returns null when nothing announced a local server', () => {
    expect(
      latestLocalUrl([
        event({
          type: 'tool-completed',
          callId: 'a',
          output: 'installed 42 packages',
        }),
        event({ type: 'text-delta', messageId: 'm', delta: 'done' }),
      ]),
    ).toBeNull();
  });
});

// ─── The process lane ────────────────────────────────────────────────────────

function makeFixtureDir(scripts?: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-preview-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'preview-fixture', version: '0.0.0', scripts }, null, 2),
  );
  return dir;
}

/**
 * A dev script that behaves like a real one: it writes its own pid somewhere we
 * can check later, announces a local URL, and then refuses to exit on its own.
 */
const ANNOUNCING_SCRIPT = [
  `node -e "`,
  `const fs=require('fs');`,
  `fs.writeFileSync(require('path').join(process.cwd(),'child.pid'),String(process.pid));`,
  `console.log('  Local:   http://localhost:5999/');`,
  `setInterval(()=>{},1000);`,
  `"`,
].join('');

function statusWhen(
  preview: BuilderPreview,
  predicate: (status: BuilderPreviewStatus) => boolean,
  timeoutMs = 20_000,
): Promise<BuilderPreviewStatus> {
  if (predicate(preview.getStatus())) return Promise.resolve(preview.getStatus());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Timed out waiting for preview state. Last status: ${JSON.stringify(
            preview.getStatus(),
          )}`,
        ),
      );
    }, timeoutMs);
    const unsubscribe = preview.subscribe((status) => {
      if (!predicate(status)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(status);
    });
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('BuilderPreview', () => {
  it('reports a missing package.json instead of spawning anything', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-preview-empty-'));
    const preview = new BuilderPreview();

    const status = await preview.start({ directory: dir });

    expect(status.state).toBe('error');
    expect(status.owner).toBe('qeda');
    expect(status.message).toMatch(/package\.json/);
    expect(status.command).toBeNull();
  });

  it('reports a project with no preview script', async () => {
    const dir = makeFixtureDir({ build: 'vite build' });
    const preview = new BuilderPreview();

    const status = await preview.start({ directory: dir });

    expect(status.state).toBe('error');
    expect(status.message).toMatch(/dev/);
    expect(status.command).toBeNull();
  });

  it('starts the dev script, reports the announced URL, and kills the whole group on stop', async () => {
    const dir = makeFixtureDir({ dev: ANNOUNCING_SCRIPT });
    const preview = new BuilderPreview();

    const status = await preview.start({ directory: dir });

    // `npm run dev` in a bare fixture directory: the command we built, and the
    // reason readiness is read from output rather than guessed from a port.
    expect(status.state).toBe('starting');
    expect(status.command).toBe('npm run dev');
    expect(status.owner).toBe('qeda');

    const ready = await statusWhen(preview, (s) => s.state === 'ready');
    expect(ready.url).toBe('http://localhost:5999/');

    const pidFile = path.join(dir, 'child.pid');
    await statusWhen(
      preview,
      () => fs.existsSync(pidFile),
      10_000,
    ).catch(() => undefined);
    const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    expect(Number.isInteger(childPid)).toBe(true);
    expect(isAlive(childPid)).toBe(true);

    const stopped = await preview.stop();
    expect(stopped.state).toBe('idle');
    expect(stopped.url).toBeNull();
    expect(stopped.message).toBe('Preview stopped.');

    // The assertion the process-group kill exists for: npm's child is gone, not
    // orphaned holding the port. Poll briefly — reparented processes are reaped
    // asynchronously.
    let alive = true;
    for (let attempt = 0; attempt < 50 && alive; attempt += 1) {
      if (!isAlive(childPid)) alive = false;
      else await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alive).toBe(false);
  }, 30_000);

  it('stops the previous process when a new preview starts', async () => {
    const dir = makeFixtureDir({ dev: ANNOUNCING_SCRIPT });
    const preview = new BuilderPreview();

    await preview.start({ directory: dir });
    await statusWhen(preview, (s) => s.state === 'ready');
    const firstPid = Number(
      fs.readFileSync(path.join(dir, 'child.pid'), 'utf8'),
    );

    await preview.start({ directory: dir });
    await statusWhen(preview, (s) => s.state === 'ready');

    let alive = true;
    for (let attempt = 0; attempt < 50 && alive; attempt += 1) {
      if (!isAlive(firstPid)) alive = false;
      else await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alive).toBe(false);
  }, 30_000);

  it('reports an exited process honestly when the script dies without a URL', async () => {
    const dir = makeFixtureDir({
      dev: 'node -e "process.exit(3)"',
    });
    const preview = new BuilderPreview();

    await preview.start({ directory: dir });
    const exited = await statusWhen(preview, (s) => s.state === 'exited');

    expect(exited.exitCode).toBe(3);
    expect(exited.message).toMatch(/before reporting a local URL/);
  }, 20_000);
});
