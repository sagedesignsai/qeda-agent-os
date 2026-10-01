/**
 * ipc/handlers/notifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native desktop OS notifications for time boxing, break completion, and reminders.
 *
 * Clicking a notification surfaces the app (Windows requires the AppUserModelID
 * set in main.ts for this to be attributed correctly) and optionally routes to
 * a renderer path — so a reminder is a doorway, not a dead toast.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, Notification, type BrowserWindow } from 'electron';
import { navigateTo } from '../../os-integration';

export function registerNotificationsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'notifications:notify',
    (
      _event,
      {
        title,
        body,
        silent,
        navigateTo: target,
      }: {
        title: string;
        body: string;
        silent?: boolean;
        navigateTo?: string;
      },
    ) => {
      try {
        if (!Notification.isSupported()) return false;
        const notification = new Notification({
          title,
          body,
          silent: silent ?? false,
        });
        notification.on('click', () => {
          if (target) {
            navigateTo(mainWindow, target);
          } else {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notification.show();
        return true;
      } catch {
        return false;
      }
    },
  );
}
