/**
 * ipc/handlers/projects.ts
 * ────────────────────────────────────────────────────────────────────────────
 * The productivity spine.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  createProject,
  deleteProject,
  getProject,
  listProjectRollups,
  listProjects,
  updateProject,
} from '../../db/projects';

export function registerProjectsHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  ipcMain.handle(
    'projects:list',
    (_e, req: Parameters<typeof listProjects>[0]) => listProjects(req),
  );

  ipcMain.handle(
    'projects:rollups',
    (_e, req: Parameters<typeof listProjectRollups>[0]) =>
      listProjectRollups(req),
  );

  ipcMain.handle(
    'projects:get',
    (_e, { id }: { id: string }) => getProject(id),
  );

  const broadcastProjectsChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projects:changed');
    }
  };

  ipcMain.handle(
    'projects:create',
    (_e, req: Parameters<typeof createProject>[0]) => {
      const project = createProject(req);
      broadcastProjectsChanged();
      return project;
    },
  );

  ipcMain.handle(
    'projects:update',
    (_e, { id, ...patch }: { id: string } & Parameters<typeof updateProject>[1]) => {
      updateProject(id, patch);
      broadcastProjectsChanged();
    },
  );

  ipcMain.handle(
    'projects:delete',
    (_e, { id }: { id: string }) => {
      const removed = deleteProject(id);
      if (removed) broadcastProjectsChanged();
      return removed;
    },
  );

  ipcMain.handle(
    'dialog:open-directory',
    async (
      event: IpcMainInvokeEvent,
      req?: { defaultPath?: string; title?: string },
    ) => {
      const parentWindow =
        BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      const result = await dialog.showOpenDialog(parentWindow, {
        title: req?.title ?? 'Select Directory',
        defaultPath: req?.defaultPath || undefined,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths.length) {
        return null;
      }
      return result.filePaths[0];
    },
  );

}
