/**
 * main/ipc/handlers/trace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed IPC façade for Nova Trace project bundles. Filesystem paths are chosen
 * in main; the renderer only ever receives project DTOs.
 */

import { BrowserWindow, ipcMain, shell } from 'electron';

import { instantiateCompositionTemplate } from '../../../lib/trace/templates';
import { generateProjectThumbnail } from '../../../lib/trace/serialize/thumbnail';
import type { TraceProject } from '../../../lib/trace/types';
import { getTraceProjectStore } from '../../trace/service.js';

export function registerTraceHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const store = getTraceProjectStore();
  const changed = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('trace:changed');
  };

  ipcMain.handle(
    'trace:list-projects',
    async (_event, req?: { includeMissing?: boolean }) => {
      await store.rescan();
      const summaries = store.listProjects(req?.includeMissing !== false);
      // Generate thumbnails for non-missing projects
      for (const summary of summaries) {
        if (!summary.missing && !summary.thumbnailSvg) {
          try {
            const opened = await store.openProject(summary.id);
            summary.thumbnailSvg = generateProjectThumbnail(opened.project);
          } catch {
            // Skip thumbnail generation if project can't be opened
          }
        }
      }
      return { projects: summaries };
    },
  );

  ipcMain.handle(
    'trace:create-project',
    async (
      _event,
      req: {
        name: string;
        templateId?: string;
        width?: number;
        height?: number;
      },
    ) => {
      const project = instantiateCompositionTemplate(req?.templateId, {
        name: req?.name,
        width: req?.width,
        height: req?.height,
      });
      const created = await store.createProject({ name: req?.name, project });
      changed();
      return { projectId: created.id, path: created.path };
    },
  );

  ipcMain.handle(
    'trace:open-project',
    async (_event, req: { projectId: string }) =>
      store.openProject(req.projectId),
  );

  ipcMain.handle(
    'trace:save-project',
    async (
      _event,
      req: {
        projectId: string;
        project: TraceProject;
        expectedRevision: number;
      },
    ) =>
      store.saveProject(req.projectId, req.project, {
        expectedRevision: req.expectedRevision,
      }),
  );

  ipcMain.handle(
    'trace:rename-project',
    async (_event, req: { projectId: string; name: string }) => {
      const project = await store.renameProject(req.projectId, req.name);
      changed();
      return { name: project.name };
    },
  );

  ipcMain.handle(
    'trace:delete-project',
    async (_event, req: { projectId: string }) => {
      const deleted = await store.deleteProject(req.projectId);
      changed();
      return { deleted };
    },
  );

  ipcMain.handle(
    'trace:reveal-project',
    async (_event, req: { projectId: string }) => {
      const opened = await store.openProject(req.projectId);
      shell.showItemInFolder(opened.path);
    },
  );

  ipcMain.handle(
    'trace:generate-template-thumbnail',
    async (_event, req: { templateId: string }) => {
      try {
        const project = instantiateCompositionTemplate(req.templateId, {});
        const svg = generateProjectThumbnail(project);
        return { thumbnailSvg: svg };
      } catch (cause) {
        return { thumbnailSvg: null, error: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  );
}
