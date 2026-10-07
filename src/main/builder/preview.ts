/**
 * main/builder/preview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Qeda's half of the preview: one managed dev-server process for the active
 * Builder session.
 *
 * THE ONE RULE THAT MATTERS
 * ─────────────────────────
 * A dev server forks. Vite spawns esbuild, Next spawns workers, and a plain
 * `child.kill()` leaves those grandchildren holding the port — so the next start
 * fails with EADDRINUSE and a process nobody can reach keeps running. Every
 * spawn here is therefore `detached: true`, which puts the child in its own
 * process group, and every teardown signals the *group* (`-pid`), not the child.
 * That is the whole reason this is a class and not a bag of helpers.
 *
 * READINESS IS REPORTED, NOT GUESSED
 * ──────────────────────────────────
 * We do not probe ports and we do not hardcode 3000. A dev server announces its
 * address when it is ready — `Local: http://localhost:5173` — and we scan its
 * output for exactly that, reusing the same `extractLocalhostUrls` the Terminal
 * uses for its "running service" pill. If nothing is announced we stay honest:
 * `starting` with the log visible, never a fake ready.
 *
 * OWNERSHIP
 * ─────────
 * This class only ever manages a process it spawned. A preview the agent started
 * inside a turn is detected by the renderer via `latestLocalUrl` and is never
 * routed through `stop()` here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EMPTY_PREVIEW_STATUS,
  MAX_PREVIEW_LOG_LINES,
  choosePreviewScript,
  detectPackageManager,
  previewArgv,
  type BuilderPreviewStatus,
} from '../../lib/builder-preview.js';
import { extractLocalhostUrls } from '../../lib/terminal-input.js';

/** How long a live process may stay silent before we say so. Never fatal. */
const READY_HINT_MS = 30_000;
/** How long `stop()` waits for a graceful exit before escalating. */
const STOP_GRACE_MS = 2_000;
/** How long after SIGTERM before the group is killed outright. */
const SIGKILL_AFTER_MS = 3_000;

export type PreviewStatusListener = (status: BuilderPreviewStatus) => void;

interface PackageJson {
  scripts?: Record<string, string>;
}

/**
 * Kill a process *group*.
 *
 * `detached: true` makes the child a group leader, so `-pid` reaches everything
 * it spawned. Windows has no such signal concept, so it gets `taskkill /T`,
 * which walks the tree for us.
 */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // taskkill missing is not actionable; the process may still be gone.
    }
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // The group is already gone, or we never owned one — try the bare pid so a
    // non-detached child is still not orphaned.
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already dead.
    }
  }

  // Escalate for servers that trap SIGTERM and refuse to leave.
  const escalation = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already dead.
    }
  }, SIGKILL_AFTER_MS);
  escalation.unref?.();
}

export class BuilderPreview {
  private child: ChildProcess | null = null;
  private status: BuilderPreviewStatus = { ...EMPTY_PREVIEW_STATUS };
  private readonly listeners = new Set<PreviewStatusListener>();
  private readyHint: NodeJS.Timeout | null = null;

  getStatus(): BuilderPreviewStatus {
    return this.status;
  }

  /** Subscribe to status changes. Returns an unsubscribe function. */
  subscribe(listener: PreviewStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(patch: Partial<BuilderPreviewStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  private clearReadyHint(): void {
    if (this.readyHint) {
      clearTimeout(this.readyHint);
      this.readyHint = null;
    }
  }

  private appendLog(chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trimEnd())
      .filter((line) => line.trim() !== '');
    if (lines.length === 0) return;
    this.publish({
      log: [...this.status.log, ...lines].slice(-MAX_PREVIEW_LOG_LINES),
    });
  }

  /**
   * Start a preview for `directory`, replacing any preview already running.
   *
   * The command is never a shell string: the script name is resolved from the
   * workspace's own `package.json` and run as `<manager> run <script>`, so a
   * script name can never turn into a second command.
   */
  async start({
    directory,
    script,
  }: {
    directory: string;
    script?: string;
  }): Promise<BuilderPreviewStatus> {
    await this.stop();

    let pkg: PackageJson | null = null;
    try {
      pkg = JSON.parse(
        await fs.readFile(path.join(directory, 'package.json'), 'utf8'),
      ) as PackageJson;
    } catch {
      this.publish({
        ...EMPTY_PREVIEW_STATUS,
        state: 'error',
        owner: 'qeda',
        directory,
        message: `No readable package.json in ${directory}. Qeda can only start a preview for a Node project.`,
      });
      return this.status;
    }

    const chosen = script ?? choosePreviewScript(pkg?.scripts);
    if (!chosen || !pkg?.scripts?.[chosen]) {
      this.publish({
        ...EMPTY_PREVIEW_STATUS,
        state: 'error',
        owner: 'qeda',
        directory,
        message:
          'No preview script found. Add a "dev", "serve", "develop" or "start" script to package.json.',
      });
      return this.status;
    }

    const entries = await fs.readdir(directory).catch(() => [] as string[]);
    const manager = detectPackageManager(entries);
    const { command, args } = previewArgv(manager, chosen);
    const display = `${command} ${args.join(' ')}`;

    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: directory,
        // Own process group so teardown can reach the grandchildren.
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Keep the log regex-friendly and stop scaffolds from hijacking the
          // user's browser — the canvas is the preview surface.
          FORCE_COLOR: '0',
          NO_COLOR: '1',
          BROWSER: 'none',
        },
      });
    } catch (error) {
      this.publish({
        ...EMPTY_PREVIEW_STATUS,
        state: 'error',
        owner: 'qeda',
        directory,
        command: display,
        message: `Could not start ${display}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return this.status;
    }

    this.child = child;
    this.publish({
      state: 'starting',
      owner: 'qeda',
      url: null,
      command: display,
      directory,
      log: [],
      exitCode: null,
      message: null,
    });

    let announced = false;
    const scan = (chunk: string) => {
      this.appendLog(chunk);
      if (announced) return;
      const urls = extractLocalhostUrls(chunk);
      if (urls.length === 0) return;
      announced = true;
      this.clearReadyHint();
      this.publish({ state: 'ready', url: urls[0], message: null });
    };

    child.stdout?.on('data', (data: Buffer) => scan(String(data)));
    child.stderr?.on('data', (data: Buffer) => scan(String(data)));

    child.on('error', (error) => {
      this.clearReadyHint();
      this.publish({
        state: 'error',
        message: `Could not start ${display}: ${error.message}`,
      });
    });

    child.on('exit', (code, signal) => {
      this.clearReadyHint();
      // A stop()/restart supersedes this child; it already published the state.
      if (this.child !== child) return;
      this.child = null;
      const how = code ?? signal ?? 'unknown';
      this.publish({
        state: 'exited',
        url: announced ? this.status.url : null,
        exitCode: code,
        message: announced
          ? `Preview process exited (${how}).`
          : `Preview process exited before reporting a local URL (${how}).`,
      });
    });

    this.readyHint = setTimeout(() => {
      if (this.child === child && this.status.state === 'starting') {
        this.publish({
          message:
            'Still running, but no local URL has been reported yet. Check the log, or open the address yourself.',
        });
      }
    }, READY_HINT_MS);
    this.readyHint.unref?.();

    return this.status;
  }

  /** Stop the Qeda-owned preview, waiting briefly for a graceful exit. */
  async stop(): Promise<BuilderPreviewStatus> {
    this.clearReadyHint();
    const child = this.child;
    const log = this.status.log.slice(-40);
    // Detach first: the exit handler must not also publish a state for a child
    // we are deliberately killing.
    this.child = null;

    if (!child || child.pid === undefined) {
      this.publish({ ...EMPTY_PREVIEW_STATUS, log });
      return this.status;
    }

    const exited = once(child, 'exit');
    killProcessTree(child.pid);
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS)),
    ]);

    this.publish({ ...EMPTY_PREVIEW_STATUS, log, message: 'Preview stopped.' });
    return this.status;
  }

  /** Fire-and-forget teardown for app quit, where nothing can be awaited. */
  dispose(): void {
    this.clearReadyHint();
    this.listeners.clear();
    const pid = this.child?.pid;
    this.child = null;
    if (pid !== undefined) killProcessTree(pid);
  }
}
