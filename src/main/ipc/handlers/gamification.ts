/**
 * ipc/handlers/gamification.ts
 * ────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the Gamification & Dopamine Engine.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, type BrowserWindow } from 'electron';
import {
  getGamificationState,
  awardXp,
  useStreakShield,
} from '../../db/gamification.js';

export function registerGamificationHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle('gamification:get-state', () => getGamificationState());

  ipcMain.handle(
    'gamification:award-xp',
    (
      _e,
      {
        amount,
        source,
        entityId,
      }: { amount: number; source: string; entityId?: string },
    ) => {
      const result = awardXp(amount, source, entityId);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gamification:updated', result);
      }
      return result;
    },
  );

  ipcMain.handle('gamification:use-shield', () => {
    const state = useStreakShield();
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gamification:updated', {
        state,
        leveledUp: false,
      });
    }
    return state;
  });
}
