/**
 * pty/manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PtyManager owns all node-pty instances for the Shell Mode terminal.
 *
 * Architecture:
 *   - Main process only — node-pty is a native module and must never touch
 *     the renderer or preload bundles (it is externalized in vite config).
 *   - Each PTY is keyed by a nanoid `ptyId`.
 *   - Output data is forwarded to the renderer via BrowserWindow.webContents
 *     using the `pty:data` IPC event.
 *   - Input / resize / kill come in via ipcMain.handle.
 *
 * Ownership rules (from research):
 *   - The renderer never imports node-pty.
 *   - main is the single writer for PTY state.
 *   - On window close / reload, all PTYs are killed to avoid zombie processes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';
import { nanoid } from 'nanoid';
import type { BrowserWindow } from 'electron';
import { Osc133Parser } from './osc133-parser.js';
import {
  getBashIntegrationPath,
  getZshIntegrationDir,
  cleanupShellIntegration,
} from './shell-integration.js';
import { execSync } from 'node:child_process';
import {
  appendBlock,
  updateBlock,
  createTerminalSession,
  updateTerminalSession,
} from '../db/terminal.js';

// node-pty is a native module — import type separately to avoid bundler issues.
// The actual require happens at runtime inside the main process.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('node-pty') as typeof import('node-pty');

type IPty = import('node-pty').IPty;

interface PtyEntry {
  pty: IPty;
  ptyId: string;
  parser?: Osc133Parser;
  sessionId?: string;
  outputBuffer: string[];
  totalOutputBytes: number;
  isCommandRunning?: boolean;
}

export class PtyManager {
  private readonly ptys = new Map<string, PtyEntry>();
  private readonly sessionPtys = new Map<string, string>();
  private window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  /** Update the target window (e.g. after a reload). */
  setWindow(window: BrowserWindow) {
    this.window = window;
  }

  /** Check if a session has an active running PTY command (e.g. dev server). */
  hasActiveRunningCommand(sessionId: string): boolean {
    const ptyId = this.sessionPtys.get(sessionId);
    if (!ptyId) return false;
    const entry = this.ptys.get(ptyId);
    return !!(entry && entry.isCommandRunning);
  }

  /** Check if a session has an active running PTY process. */
  hasActivePty(sessionId: string): boolean {
    const ptyId = this.sessionPtys.get(sessionId);
    return !!(ptyId && this.ptys.has(ptyId));
  }

  /** Kill the active PTY associated with a session ID. */
  killBySessionId(sessionId: string): void {
    const ptyId = this.sessionPtys.get(sessionId);
    if (ptyId) {
      this.kill(ptyId);
      this.sessionPtys.delete(sessionId);
    }
  }

  /**
   * Spawn a new PTY shell (or re-attach to an existing one for the session)
   * and start forwarding its output to the renderer.
   * Returns the ptyId.
   */
  create(opts: {
    cols: number;
    rows: number;
    cwd?: string;
    shell?: string;
    sessionId?: string;
    enableShellIntegration?: boolean;
  }): string {
    // If sessionId already has an active running PTY, reattach and replay recent output
    if (opts.sessionId && this.sessionPtys.has(opts.sessionId)) {
      const existingPtyId = this.sessionPtys.get(opts.sessionId)!;
      const existing = this.ptys.get(existingPtyId);
      if (existing) {
        try {
          existing.pty.resize(opts.cols, opts.rows);
        } catch {}
        // Replay output buffer to renderer so terminal state is restored
        if (existing.outputBuffer.length > 0 && !this.window.isDestroyed()) {
          const replayData = existing.outputBuffer.join('');
          this.window.webContents.send('pty:data', {
            ptyId: existing.ptyId,
            data: replayData,
          });
        }
        return existing.ptyId;
      } else {
        this.sessionPtys.delete(opts.sessionId);
      }
    }

    const ptyId = nanoid();

    const targetShell =
      opts.shell ??
      process.env.SHELL ??
      (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');

    const shellBasename = path.basename(targetShell).toLowerCase();
    let spawnArgs: string[] = [];
    const spawnEnv: Record<string, string> = { ...(process.env as Record<string, string>) };

    const useIntegration = opts.enableShellIntegration ?? true;

    if (useIntegration && process.platform !== 'win32') {
      try {
        if (shellBasename === 'bash') {
          spawnArgs = ['--rcfile', getBashIntegrationPath(), '-i'];
        } else if (shellBasename === 'zsh') {
          spawnEnv.ZDOTDIR = getZshIntegrationDir();
        }
      } catch (err) {
        // Fallback gracefully without integration if script creation fails
        console.warn('[PtyManager] Could not prepare shell integration:', err);
      }
    }

    const instance = pty.spawn(targetShell, spawnArgs, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd ?? process.env.HOME ?? process.cwd(),
      env: spawnEnv,
    });

    let activeBlockId: string | null = null;
    let entry: PtyEntry;

    const parser = new Osc133Parser({
      onCommandStart: (command, cwd) => {
        // Auto-create session on first command if this PTY was launched without a sessionId
        if (!opts.sessionId && !entry.sessionId && command) {
          try {
            const folder = cwd ? path.basename(cwd) : '';
            let branch = '';
            try {
              branch = execSync('git rev-parse --abbrev-ref HEAD', {
                cwd: cwd || undefined,
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 1000,
              }).trim();
            } catch {}

            const branchSuffix = branch ? ` (${branch})` : '';
            const shortCmd = command.length > 25 ? `${command.slice(0, 22)}…` : command;
            const title = `${shortCmd} · ${folder || 'terminal'}${branchSuffix}`;

            const session = createTerminalSession({
              title,
              goal: command,
              cwd: cwd || undefined,
            });
            updateTerminalSession(session.id, { status: 'running' });

            opts.sessionId = session.id;
            entry.sessionId = session.id;
            this.sessionPtys.set(session.id, ptyId);

            if (!this.window.isDestroyed()) {
              this.window.webContents.send('pty:session-assigned', {
                ptyId,
                sessionId: session.id,
                title,
              });
              this.window.webContents.send('terminal:session-status', {
                sessionId: session.id,
                status: 'running',
              });
              this.window.webContents.send('terminal:sessions-changed');
            }
          } catch (err) {
            console.warn('[PtyManager] Could not auto-create session on command start:', err);
          }
        }

        const sid = opts.sessionId || entry.sessionId;
        if (sid && command) {
          entry.isCommandRunning = true;
          try {
            const block = appendBlock({
              sessionId: sid,
              command,
              agentThought: '',
            });
            activeBlockId = block.id;
            updateBlock(block.id, { status: 'running' });
            updateTerminalSession(sid, { status: 'running' });
            if (!this.window.isDestroyed()) {
              this.window.webContents.send('terminal:block-proposed', block);
              this.window.webContents.send('terminal:block-update-event', {
                id: block.id,
                status: 'running',
              });
              this.window.webContents.send('terminal:session-status', {
                sessionId: sid,
                status: 'running',
              });
            }
          } catch {
            // DB safety
          }
        }
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('pty:block-started', {
            ptyId,
            command,
            cwd,
          });
        }
      },
      onCommandEnd: (event) => {
        entry.isCommandRunning = false;
        const sid = opts.sessionId || entry.sessionId;
        if (sid && activeBlockId) {
          try {
            updateBlock(activeBlockId, {
              status: event.status,
              output: event.output,
              exit_code: event.exitCode,
              duration_ms: event.durationMs,
            });
            const sessionStatus = event.exitCode === 0 ? 'idle' : 'error';
            updateTerminalSession(sid, { status: sessionStatus });
            if (!this.window.isDestroyed()) {
              this.window.webContents.send('terminal:block-update-event', {
                id: activeBlockId,
                status: event.status,
                output: event.output,
                exit_code: event.exitCode,
                duration_ms: event.durationMs,
              });
              this.window.webContents.send('terminal:session-status', {
                sessionId: sid,
                status: sessionStatus,
              });
              this.window.webContents.send('terminal:sessions-changed');
            }
          } catch {
            // DB safety
          }
          activeBlockId = null;
        }
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('pty:block-completed', {
            ptyId,
            blockId: event.id,
            command: event.command,
            output: event.output,
            exitCode: event.exitCode ?? 0,
            durationMs: event.durationMs,
            cwd: event.cwd,
          });
        }
      },
      onCwdChange: (cwd) => {
        const sid = opts.sessionId || entry.sessionId;
        if (sid) {
          try {
            updateTerminalSession(sid, { cwd });
          } catch {}
        }
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('pty:cwd-changed', { ptyId, cwd });
        }
      },
    });

    // Forward clean PTY output (OSC control sequences stripped) to renderer
    instance.onData((data: string) => {
      const clean = parser.feed(data);
      if (clean.length > 0) {
        entry.outputBuffer.push(clean);
        entry.totalOutputBytes += clean.length;
        while (entry.totalOutputBytes > 120_000 && entry.outputBuffer.length > 1) {
          const removed = entry.outputBuffer.shift()!;
          entry.totalOutputBytes -= removed.length;
        }

        if (!this.window.isDestroyed()) {
          this.window.webContents.send('pty:data', { ptyId, data: clean });
        }
      }
    });

    // Forward PTY exit to renderer and clean up
    instance.onExit(({ exitCode }: { exitCode: number }) => {
      const sid = opts.sessionId || entry.sessionId;
      if (sid) {
        this.sessionPtys.delete(sid);
        try {
          updateTerminalSession(sid, { status: exitCode === 0 ? 'done' : 'error' });
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('terminal:session-status', {
              sessionId: sid,
              status: exitCode === 0 ? 'done' : 'error',
            });
            this.window.webContents.send('terminal:sessions-changed');
          }
        } catch {}
      }
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('pty:exit', { ptyId, exitCode });
      }
      this.ptys.delete(ptyId);
    });

    entry = {
      pty: instance,
      ptyId,
      parser,
      sessionId: opts.sessionId,
      outputBuffer: [],
      totalOutputBytes: 0,
    };
    this.ptys.set(ptyId, entry);
    if (opts.sessionId) {
      this.sessionPtys.set(opts.sessionId, ptyId);
    }
    return ptyId;
  }

  /** Write input data to a PTY. */
  write(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.pty.write(data);
  }

  /** Notify the PTY of a resize. */
  resize(ptyId: string, cols: number, rows: number): void {
    this.ptys.get(ptyId)?.pty.resize(cols, rows);
  }

  /** Kill a PTY. */
  kill(ptyId: string): void {
    const entry = this.ptys.get(ptyId);
    if (entry) {
      if (entry.sessionId) {
        this.sessionPtys.delete(entry.sessionId);
      }
      try {
        entry.pty.kill();
      } catch {}
      this.ptys.delete(ptyId);
    }
  }

  /** Kill the active PTY associated with a specific session ID, if any. */
  killBySessionId(sessionId: string): boolean {
    const ptyId = this.sessionPtys.get(sessionId);
    if (ptyId) {
      this.kill(ptyId);
      return true;
    }
    return false;
  }

  /** Kill all PTYs — call on window close or reload. */
  killAll(): void {
    for (const { ptyId } of this.ptys.values()) {
      this.kill(ptyId);
    }
    this.sessionPtys.clear();
    cleanupShellIntegration();
  }
}

/** Singleton manager — created once in registerPtyHandlers. */
let manager: PtyManager | null = null;

export function getPtyManager(): PtyManager | null {
  return manager;
}

/**
 * Register all pty:* IPC handlers against the given window.
 * Call this from the main process after the BrowserWindow is created.
 */
export function registerPtyHandlers(
  ipcMain: Electron.IpcMain,
  window: BrowserWindow,
): void {
  // Create or replace the singleton manager
  if (manager) {
    manager.setWindow(window);
  } else {
    manager = new PtyManager(window);
  }

  // Kill everything on window close to avoid zombie processes
  window.on('closed', () => {
    manager?.killAll();
  });

  ipcMain.handle(
    'pty:create',
    (
      _e,
      opts: {
        cols: number;
        rows: number;
        cwd?: string;
        shell?: string;
        sessionId?: string;
        enableShellIntegration?: boolean;
      },
    ) => {
      const ptyId = manager!.create(opts);
      return { ptyId };
    },
  );

  ipcMain.handle(
    'pty:write',
    (_e, { ptyId, data }: { ptyId: string; data: string }) => {
      manager!.write(ptyId, data);
    },
  );

  ipcMain.handle(
    'pty:resize',
    (_e, { ptyId, cols, rows }: { ptyId: string; cols: number; rows: number }) => {
      manager!.resize(ptyId, cols, rows);
    },
  );

  ipcMain.handle(
    'pty:kill',
    (_e, { ptyId }: { ptyId: string }) => {
      manager!.kill(ptyId);
    },
  );
}
