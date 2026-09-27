/**
 * ipc/handlers/notifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native desktop OS notifications for time boxing, break completion, and reminders.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, Notification } from 'electron';

export function registerNotificationsHandlers(): void {
  ipcMain.handle(
    'notifications:notify',
    (_event, { title, body, silent }: { title: string; body: string; silent?: boolean }) => {
      try {
        if (!Notification.isSupported()) return false;
        const notification = new Notification({
          title,
          body,
          silent: silent ?? false,
        });
        notification.show();
        return true;
      } catch {
        return false;
      }
    },
  );
}
