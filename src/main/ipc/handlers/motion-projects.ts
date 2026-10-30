/**
 * main/ipc/handlers/motion-projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed IPC façade for Motion's project bundle lifecycle. Filesystem paths are
 * selected and validated in main; the renderer only receives project DTOs.
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { getMotionProjectStore } from '../../motion/service.js';

export function registerMotionProjectsHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  const store = getMotionProjectStore();
  const changed = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('motion:changed');
  };

  ipcMain.handle('motion:list-projects', async (_event, req?: { includeMissing?: boolean }) => {
    await store.rescan();
    const projects = store.listProjects();
    return { projects: req?.includeMissing === false ? projects.filter((item) => !item.missing) : projects };
  });

  ipcMain.handle('motion:create-project', async (_event, req: { name: string }) => {
    const project = await store.createProject(req ?? {});
    changed();
    return { projectId: project.id, path: project.path };
  });

  ipcMain.handle('motion:save-copy', async (_event, req: { document: import('../../../lib/motion/types').MotionDocument; name?: string }) => {
    const project = await store.saveCopy(req.document, req.name);
    changed();
    return { projectId: project.id, path: project.path };
  });

  ipcMain.handle('motion:open-project', async (_event, { projectId }: { projectId: string }) => store.openProject(projectId));

  ipcMain.handle('motion:save-project', async (_event, req: { projectId: string; document: import('../../../lib/motion/types').MotionDocument; expectedRevision: number; destructive?: boolean; forceBackup?: boolean }) =>
    store.saveProject(req.projectId, req.document, {
      expectedRevision: req.expectedRevision,
      destructive: req.destructive,
      forceBackup: req.forceBackup,
    }),
  );

  ipcMain.handle('motion:rename-project', async (_event, { projectId, name }: { projectId: string; name: string }) => {
    const project = await store.renameProject(projectId, name);
    changed();
    return { name: project.name };
  });

  ipcMain.handle('motion:duplicate-project', async (_event, { projectId }: { projectId: string }) => {
    const project = await store.duplicateProject(projectId);
    changed();
    return { projectId: project.id };
  });

  ipcMain.handle('motion:delete-project', async (_event, { projectId }: { projectId: string }) => {
    const removed = await store.deleteProject(projectId, (projectPath) => shell.trashItem(projectPath));
    if (removed) changed();
    return { trashed: removed };
  });

  ipcMain.handle('motion:locate-project', async (_event, { projectId }: { projectId: string }) => {
    const choice = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    const project = await store.locateProject(projectId, choice.filePaths[0]);
    changed();
    return { path: project.path };
  });

  ipcMain.handle('motion:recover-project', async (_event, { projectId, action }: { projectId: string; action: 'recover' | 'discard' }) => {
    const result = await store.resolveRecovery(projectId, action);
    changed();
    return { document: result.document, path: result.path };
  });

  ipcMain.handle('motion:list-backups', async (_event, { projectId }: { projectId: string }) => ({
    backups: await store.listBackups(projectId),
  }));
  ipcMain.handle('motion:restore-backup', async (_event, { projectId, revision }: { projectId: string; revision: number }) => {
    const result = await store.restoreBackup(projectId, revision);
    changed();
    return { document: result.document, path: result.path };
  });
  ipcMain.handle('motion:duplicate-for-repair', async (_event, { projectId }: { projectId: string }) => {
    const project = await store.duplicateForRepair(projectId);
    changed();
    return { projectId: project.id };
  });
  ipcMain.handle('motion:preserve-recovery-copy', async (_event, { projectId }: { projectId: string }) => ({
    path: await store.preserveInvalidRecoveryCopy(projectId),
  }));

  ipcMain.handle('motion:rescan-projects', async () => ({ projects: await store.rescan(true) }));
  ipcMain.handle('motion:reveal-project', async (_event, { projectId }: { projectId: string }) => {
    const error = await shell.openPath(store.getProjectDirectory(projectId));
    if (error) throw new Error(error);
  });
  ipcMain.handle('motion:read-editor-state', async (_event, { projectId }: { projectId: string }) => ({ state: await store.readEditorState(projectId) }));
  ipcMain.handle('motion:write-editor-state', async (_event, { projectId, state }: { projectId: string; state: unknown }) => store.writeEditorState(projectId, state));
}
