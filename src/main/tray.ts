/**
 * main/tray.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * System tray / menu-bar presence.
 *
 * Qeda is an "always there for you" app — capture, focus, and research happen
 * away from the keyboard — so it should live in the tray like a native agent,
 * reachable without hunting for its window. Clicking a tray action routes the
 * running app via `ui:navigate` rather than opening a second window.
 *
 * The module holds the single Tray reference: Electron garbage-collects a
 * tray icon that isn't strongly referenced, which makes the icon silently
 * vanish — the classic tray bug.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron';
import { navigateTo } from './os-integration';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow, iconPath: string): void {
  if (tray) return;

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Qeda — finish what you start');

  const show = () => {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Qeda', click: show },
      { type: 'separator' },
      {
        label: 'Quick Capture…',
        accelerator: 'CommandOrControl+Shift+Space',
        click: () => navigateTo(mainWindow, '/tasks?capture=1'),
      },
      {
        label: 'New Chat',
        click: () => navigateTo(mainWindow, '/chat'),
      },
      {
        label: 'Today’s Focus',
        click: () => navigateTo(mainWindow, '/tasks'),
      },
      { type: 'separator' },
      { label: 'Quit Qeda', click: () => app.quit() },
    ]),
  );
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
