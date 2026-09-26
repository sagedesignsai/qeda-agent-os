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
import { appendBlock, updateBlock } from '../db/terminal.js';

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
}

export class PtyManager {
  private readonly ptys = new Map<string, PtyEntry>();
  private window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  /** Update the target window (e.g. after a reload). */
  setWindow(window: BrowserWindow) {
    this.window = window;
  }

  /**
   * Spawn a new PTY shell and start forwarding its output to the renderer.
   * If shell integration is enabled (default), injects OSC 133 semantic hooks
   * to automatically slice interactive commands into blocks.
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

    const parser = new Osc133Parser({
      onCommandStart: (command, cwd) => {
        if (opts.sessionId && command) {
          try {
            const block = appendBlock({
              sessionId: opts.sessionId,
              command,
              agentThought: '',
            });
            activeBlockId = block.id;
            updateBlock(block.id, { status: 'running' });
            if (!this.window.isDestroyed()) {
              this.window.webContents.send('terminal:block-proposed', block);
              this.window.webContents.send('terminal:block-update-event', {
                id: block.id,
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
        if (opts.sessionId && activeBlockId) {
          try {
            updateBlock(activeBlockId, {
              status: event.status,
              output: event.output,
              exit_code: event.exitCode,
              duration_ms: event.durationMs,
            });
            if (!this.window.isDestroyed()) {
              this.window.webContents.send('terminal:block-update-event', {
                id: activeBlockId,
                status: event.status,
                output: event.output,
                exit_code: event.exitCode,
                duration_ms: event.durationMs,
              });
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
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('pty:cwd-changed', { ptyId, cwd });
        }
      },
    });

    // Forward clean PTY output (OSC control sequences stripped) to renderer
    instance.onData((data: string) => {
      const clean = parser.feed(data);
      if (!this.window.isDestroyed() && clean.length > 0) {
        this.window.webContents.send('pty:data', { ptyId, data: clean });
      }
    });

    // Forward PTY exit to renderer and clean up
    instance.onExit(({ exitCode }: { exitCode: number }) => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('pty:exit', { ptyId, exitCode });
      }
      this.ptys.delete(ptyId);
    });

    this.ptys.set(ptyId, { pty: instance, ptyId, parser, sessionId: opts.sessionId });
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
      entry.pty.kill();
      this.ptys.delete(ptyId);
    }
  }

  /** Kill all PTYs — call on window close or reload. */
  killAll(): void {
    for (const { ptyId } of this.ptys.values()) {
      this.kill(ptyId);
    }
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
