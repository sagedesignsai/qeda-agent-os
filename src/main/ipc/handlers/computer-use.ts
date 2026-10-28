/**
 * ipc/handlers/computer-use.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for Computer Use: screenshot capture and input injection.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as cu from '../../computer-use.js';

export function registerComputerUseHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcast = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('computer-use:changed');
    }
  };

  ipcMain.handle('computer-use:get-screen-size', async () => {
    return await cu.getScreenSize();
  });
  ipcMain.handle('computer-use:get-cursor-position', async () => {
    return await cu.getCursorPosition();
  });
  ipcMain.handle('computer-use:move-mouse', async (_e, req) => {
    await cu.moveMouse(req.x, req.y);
    broadcast();
    return { ok: true };
  });
  ipcMain.handle('computer-use:click', async (_e, req) => {
    await cu.click(req.x, req.y, req.button);
    broadcast();
    return { ok: true };
  });
  ipcMain.handle('computer-use:double-click', async (_e, req) => {
    await cu.doubleClick(req.x, req.y);
    broadcast();
    return { ok: true };
  });
  ipcMain.handle('computer-use:type-text', async (_e, req) => {
    await cu.typeText(req.text);
    broadcast();
    return { ok: true };
  });
  ipcMain.handle('computer-use:press-key', async (_e, req) => {
    await cu.pressKey(req.key, req.modifiers);
    broadcast();
    return { ok: true };
  });
  ipcMain.handle('computer-use:scroll', async (_e, req) => {
    await cu.scroll(req.x, req.y, req.deltaX, req.deltaY);
    broadcast();
    return { ok: true };
  });
  ipcMain.handle('computer-use:capture-screenshot', async (_e, req) => {
    return await cu.captureScreenshot(req?.sourceId);
  });
  ipcMain.handle('computer-use:get-active-window', async () => {
    const title = await cu.getActiveWindowTitle();
    return { title };
  });
  ipcMain.handle('computer-use:is-allowed', async () => {
    return await cu.isAllowed();
  });
  ipcMain.handle('computer-use:wait', async (_e, req) => {
    await cu.wait(req.ms);
    return { ok: true };
  });
}
