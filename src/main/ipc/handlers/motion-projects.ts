/**
 * main/ipc/handlers/motion-projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed IPC façade for Motion's project bundle lifecycle. Filesystem paths are
 * selected and validated in main; the renderer only receives project DTOs.
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { getMotionAssetStore, getMotionProjectStore } from '../../motion/service.js';
import { MotionRemoteAssetClient } from '../../motion/remote-assets.js';
import { createBlankMotionDocument } from '../../../lib/motion/defaults.js';
import { createMotionTemplate } from '../../../lib/motion/templates.js';

export function registerMotionProjectsHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  const store = getMotionProjectStore();
  const assets = getMotionAssetStore();
  const remoteAssets = new MotionRemoteAssetClient(assets, {
    onProgress: (progress) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('motion:remote-import-progress', progress);
    },
  });
  const changed = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('motion:changed');
  };

  ipcMain.handle('motion:list-projects', async (_event, req?: { includeMissing?: boolean }) => {
    await store.rescan();
    const projects = store.listProjects();
    return { projects: req?.includeMissing === false ? projects.filter((item) => !item.missing) : projects };
  });

  ipcMain.handle('motion:create-project', async (_event, req: { name: string; templateId?: string; blank?: boolean; output?: { width: number; height: number; fps: number }; duration?: number }) => {
    const document = req?.templateId ? createMotionTemplate(req.templateId) : req?.blank ? createBlankMotionDocument({
      name: req.name,
      width: req.output?.width,
      height: req.output?.height,
      fps: req.output?.fps,
      duration: req.duration,
    }) : undefined;
    const project = await store.createProject({ name: req?.name, ...(document ? { document } : {}) });
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

  ipcMain.handle('motion:stage-assets', async (_event, { projectId, paths }: { projectId: string; paths: string[] }) => assets.stageAssets(projectId, paths));
  ipcMain.handle('motion:pick-assets', async (_event, { projectId }: { projectId: string }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Motion assets',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Motion assets', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'm4a', 'ogg', 'woff', 'woff2', 'ttf', 'otf', 'glb', 'gltf', 'hdr', 'exr'] }],
    });
    if (result.canceled) return { items: [], errors: [] };
    return assets.stageAssets(projectId, result.filePaths);
  });
  ipcMain.handle('motion:commit-assets', async (_event, { projectId, items }: { projectId: string; items: import('../../motion/asset-store.js').MotionAssetCommit[] }) => assets.commitAssets(projectId, items));
  ipcMain.handle('motion:cancel-import', async (_event, { projectId, importIds }: { projectId: string; importIds: string[] }) => assets.cancelImports(projectId, importIds));
  ipcMain.handle('motion:inspect-assets', async (_event, { projectId }: { projectId: string }) => assets.inspectAssets(projectId));
  ipcMain.handle('motion:relink-asset', async (_event, { projectId, assetId }: { projectId: string; assetId: string }) => {
    const asset = (await store.openProject(projectId)).document.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error(`Asset "${assetId}" does not exist.`);
    const choice = await dialog.showOpenDialog(mainWindow, {
      title: `Relink ${asset.name}`,
      properties: ['openFile'],
      filters: [{ name: `${asset.kind} asset`, extensions: [asset.path.split('.').pop() ?? '*'] }],
    });
    if (choice.canceled || !choice.filePaths[0]) return null;
    let result = await assets.relinkAsset(projectId, assetId, choice.filePaths[0]);
    if (!result.matches) {
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Relink anyway', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'This file is different from the original.',
        detail: 'Relinking keeps the asset id and references, but replaces its stored content.',
      });
      if (confirmation.response !== 0) return null;
      result = await assets.relinkAsset(projectId, assetId, choice.filePaths[0], true);
    }
    return { assetId, ...result };
  });
  ipcMain.handle('motion:reveal-asset', async (_event, { projectId, assetId }: { projectId: string; assetId: string }) => {
    const filePath = await assets.revealAsset(projectId, assetId);
    if (filePath) shell.showItemInFolder(filePath);
  });
  ipcMain.handle('motion:clean-unused-assets', async (_event, { projectId }: { projectId: string }) => assets.cleanUnusedFiles(projectId));

  ipcMain.handle('motion:search-remote-assets', async (_event, req: {
    provider: 'polyhaven';
    query: string;
    kind: 'model' | 'environment';
    limit?: number;
  }) => remoteAssets.search(req));
  ipcMain.handle('motion:remote-asset-variants', async (_event, req: {
    provider: 'polyhaven';
    assetId: string;
    kind: 'model' | 'environment';
  }) => remoteAssets.variants(req));
  ipcMain.handle('motion:import-remote-assets', async (_event, req: {
    projectId: string;
    provider: 'polyhaven';
    assetId: string;
    kind: 'model' | 'environment';
    variantId: string;
    requestId?: string;
  }) => {
    const { projectId, ...importRequest } = req;
    return remoteAssets.import(projectId, importRequest);
  });
  ipcMain.handle('motion:cancel-remote-import', async (_event, { requestId }: { requestId: string }) => remoteAssets.cancelImport(requestId));
}
