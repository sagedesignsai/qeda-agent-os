/**
 * ipc/handlers/autonomous-operator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC control surface for the Autonomous Operator daemon.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getAutonomousOperator } from '../../ai/autonomous-operator.js';

let wired = false;

export function registerAutonomousOperatorHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const operator = getAutonomousOperator();

  if (!wired) {
    wired = true;
    operator.on((event) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autonomous:event', event);
      }
    });
  }

  ipcMain.handle('autonomous:status', async () => {
    return operator.getStatus();
  });

  ipcMain.handle('autonomous:pause', async () => {
    return operator.pause();
  });

  ipcMain.handle('autonomous:stop', async () => {
    return operator.stop();
  });

  ipcMain.handle(
    'autonomous:start-task',
    async (_e, req?: { taskId?: string; maxSteps?: number }) => {
      if (req?.taskId) {
        return await operator.startTask(req.taskId);
      }
      return operator.start({ maxSteps: req?.maxSteps });
    },
  );
}
