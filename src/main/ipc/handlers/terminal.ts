/**
 * ipc/handlers/terminal.ts
 * ────────────────────────────────────────────────────────────────────────────
 * The agentic terminal: goal execution, command blocks, approvals.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, shell, type BrowserWindow } from 'electron';
import { exec } from 'node:child_process';
import path from 'node:path';
import { clearSessionEnv } from '../../ai/shell-env.js';
import {
  executeDirectCommand,
  explainBlock,
  resolveApproval,
  runGoal,
  stopCommand,
  stopSessionProcesses,
  suggestFix,
  type TerminalAgentEmitter,
} from '../../ai/terminal-agent';
import {
  createTerminalSession,
  deleteTerminalSession,
  getBlock,
  getSessionBlocks,
  getTerminalSession,
  listTerminalSessions,
  updateBlock as updateTerminalBlock,
  updateTerminalSession,
} from '../../db/terminal';
import { getPtyManager } from '../../pty/manager.js';

export function registerTerminalHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  /**
   * Bridge agent/direct-execution events onto IPC. Built once per call site so
   * `terminal:execute-command`, `terminal:rerun-block` and `terminal:run-goal`
   * all emit through an identical channel set — the renderer needs one code path.
   */
  const makeTerminalEmitter = (
    currentGoal?: string,
    linkedTaskId?: string,
  ): TerminalAgentEmitter => ({
    onBlockProposed(block) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:block-proposed', block);
      }
    },
    onBlockUpdated(patch) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:block-update-event', patch);
      }
    },
    onDone(sid, summary) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-done', {
          sessionId: sid,
          summary,
        });
      }
      // Auto-rename: truncate goal to a clean title and notify sidebar
      const autoTitle = currentGoal
        ? currentGoal.length > 48
          ? `${currentGoal.slice(0, 45)}…`
          : currentGoal
        : undefined;
      updateTerminalSession(sid, {
        status: 'done',
        ...(autoTitle ? { title: autoTitle } : {}),
      });
      if (!mainWindow.isDestroyed()) {
        if (autoTitle) {
          mainWindow.webContents.send('terminal:session-renamed', {
            sessionId: sid,
            title: autoTitle,
          });
        }
        mainWindow.webContents.send('terminal:session-status', {
          sessionId: sid,
          status: 'done',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
    onError(sid, error) {
      updateTerminalSession(sid, { status: 'error' });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-error', {
          sessionId: sid,
          error,
        });
        mainWindow.webContents.send('terminal:session-status', {
          sessionId: sid,
          status: 'error',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
    onTaskCompleted(sid, taskId) {
      // Broadcast cross-feature events so the Tasks page refreshes and the
      // user sees the task move to Done without a manual switch of tabs.
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:goal-done', {
          sessionId: sid,
          taskId,
        });
        mainWindow.webContents.send('tasks:changed');
      }
    },
  });

  ipcMain.handle(
    'terminal:sessions-list',
    (_e, req: { projectId?: string | null } | void) => {
      const list = listTerminalSessions(
        req?.projectId !== undefined ? { projectId: req.projectId } : undefined,
      );
      const ptyMgr = getPtyManager();
      if (ptyMgr) {
        return list.map((session) => {
          if (ptyMgr.hasActiveRunningCommand(session.id)) {
            return { ...session, status: 'running' as const };
          }
          return session;
        });
      }
      return list;
    },
  );

  ipcMain.handle('terminal:session-get', (_e, { id }: { id: string }) => {
    const session = getTerminalSession(id);
    if (!session) return null;
    const ptyMgr = getPtyManager();
    if (ptyMgr && ptyMgr.hasActiveRunningCommand(id)) {
      return { ...session, status: 'running' as const };
    }
    return session;
  });

  ipcMain.handle(
    'terminal:session-create',
    (
      _e,
      {
        title,
        goal,
        cwd,
        project_id,
      }: {
        title?: string;
        goal?: string;
        cwd?: string;
        project_id?: string | null;
      },
    ) => {
      const session = createTerminalSession({ title, goal, cwd, project_id });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:sessions-changed');
      }
      return session;
    },
  );

  ipcMain.handle('terminal:session-delete', (_e, { id }: { id: string }) => {
    stopSessionProcesses(id);
    getPtyManager()?.killBySessionId(id);
    clearSessionEnv(id);
    deleteTerminalSession(id);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:sessions-changed');
    }
  });

  ipcMain.handle(
    'terminal:session-rename',
    (_e, { id, title }: { id: string; title: string }) => {
      updateTerminalSession(id, { title });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-renamed', {
          sessionId: id,
          title,
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
  );

  ipcMain.handle(
    'terminal:blocks-get',
    (_e, { sessionId }: { sessionId: string }) => getSessionBlocks(sessionId),
  );

  ipcMain.handle(
    'terminal:block-update',
    (
      _e,
      {
        id,
        patch,
      }: { id: string; patch: Parameters<typeof updateTerminalBlock>[1] },
    ) => updateTerminalBlock(id, patch),
  );

  ipcMain.handle(
    'terminal:run-goal',
    (_e, { sessionId, goal, taskId }: { sessionId: string; goal: string; taskId?: string }) => {
      // Update the session with the goal text
      updateTerminalSession(sessionId, { goal, status: 'running' });

      // Notify sidebar immediately so the spinner appears
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-status', {
          sessionId,
          status: 'running',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }

      // Build the emitter — bridges agent events to IPC events
      const emitter = makeTerminalEmitter(goal, taskId);

      // Fire-and-forget — agent runs async, IPC events carry progress
      void runGoal({ sessionId, goal, taskId, emitter });
    },
  );

  ipcMain.handle(
    'terminal:execute-command',
    (
      _e,
      {
        sessionId,
        command,
        cwd,
      }: { sessionId: string; command: string; cwd?: string },
    ) => {
      const session = getTerminalSession(sessionId);
      const effectiveCwd = cwd || session?.cwd || process.cwd();

      // If the session title starts with "cd " and a real command is now run, update the title
      if (
        session &&
        session.title.startsWith('cd ') &&
        !command.trim().startsWith('cd')
      ) {
        const folder = effectiveCwd ? path.basename(effectiveCwd) : '';
        const shortCmd =
          command.length > 25 ? `${command.slice(0, 22)}…` : command;
        const newTitle = `${shortCmd} · ${folder || 'terminal'}`;
        updateTerminalSession(sessionId, { title: newTitle });
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:session-renamed', {
            sessionId,
            title: newTitle,
          });
          mainWindow.webContents.send('terminal:sessions-changed');
        }
      }

      updateTerminalSession(sessionId, {
        status: 'running',
        ...(effectiveCwd ? { cwd: effectiveCwd } : {}),
      });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-status', {
          sessionId,
          status: 'running',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }

      const emitter = makeTerminalEmitter();
      void executeDirectCommand({
        sessionId,
        command,
        cwd: effectiveCwd,
        emitter: {
          ...emitter,
          onCwdChanged: (newCwd) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('pty:cwd-changed', {
                ptyId: '',
                cwd: newCwd,
              });
            }
          },
          onDone: (sid, summary) => {
            emitter.onDone(sid, summary);
            updateTerminalSession(sid, { status: 'idle' });
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:session-status', {
                sessionId: sid,
                status: 'idle',
              });
              mainWindow.webContents.send('terminal:sessions-changed');
            }
          },
          onError: (sid, err) => {
            emitter.onError(sid, err);
            updateTerminalSession(sid, { status: 'error' });
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:session-status', {
                sessionId: sid,
                status: 'error',
              });
              mainWindow.webContents.send('terminal:sessions-changed');
            }
          },
        },
      });
    },
  );

  ipcMain.handle(
    'terminal:rerun-block',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      const block = getBlock(blockId);
      if (!block || !block.command) return;

      // A re-run is a *new* block rather than a mutation, so the original
      // result and its duration stay in the transcript as history.
      void executeDirectCommand({
        sessionId,
        command: block.command,
        emitter: makeTerminalEmitter(),
      });
    },
  );

  ipcMain.handle(
    'terminal:suggest-fix',
    async (_e, { blockId }: { blockId: string }) => {
      // Returns a proposal only; the renderer puts it in the input bar.
      return suggestFix(blockId);
    },
  );

  ipcMain.handle(
    'terminal:approve',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      resolveApproval(sessionId, blockId, true);
    },
  );

  ipcMain.handle(
    'terminal:reject',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      resolveApproval(sessionId, blockId, false);
    },
  );

  ipcMain.handle(
    'terminal:explain',
    async (_e, { blockId }: { blockId: string }) => {
      const explanation = await explainBlock(blockId);
      return { explanation };
    },
  );

  ipcMain.handle(
    'terminal:stop-command',
    (_e, { blockId }: { blockId: string }) => {
      return { stopped: stopCommand(blockId) };
    },
  );

  ipcMain.handle('terminal:open-url', (_e, { url }: { url: string }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      void shell.openExternal(url);
    }
  });

  ipcMain.handle(
    'terminal:get-context-info',
    async (_e, opts?: { cwd?: string }) => {
      const dir = opts?.cwd || process.env.HOME || process.cwd();
      let gitBranch: string | null = null;
      try {
        const { stdout } = await new Promise<{ stdout: string }>(
          (resolve, reject) => {
            exec(
              'git rev-parse --abbrev-ref HEAD',
              { cwd: dir, timeout: 1500 },
              (err, out) => {
                if (err) reject(err);
                else resolve({ stdout: out });
              },
            );
          },
        );
        const trimmed = stdout.trim();
        if (trimmed && !trimmed.includes('\n')) {
          gitBranch = trimmed;
        }
      } catch {
        // Not a git repo or git not found
      }
      return { cwd: dir, gitBranch };
    },
  );
}
