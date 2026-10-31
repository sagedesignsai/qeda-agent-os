/**
 * main/ipc/handlers/motion-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Export entry points. The editor only picks a destination and starts a job;
 * progress, chunks, and completion arrive from the hidden render window and are
 * validated by `MotionRenderHost` before touching the output file.
 */

import path from 'node:path';
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';

import { getMotionAssetStore } from '../../motion/service.js';
import { MotionRenderHost } from '../../motion/render-host.js';
import { MotionRenderJobs } from '../../motion/render-jobs.js';
import type { MotionDocument } from '../../../lib/motion/types';
import {
  getMotionExportPreset,
  motionExportFileName,
} from '../../../lib/motion/export/presets.js';
import {
  parseMotionExportChunk,
  parseMotionExportFailure,
  parseMotionExportJobRef,
  parseMotionExportProgress,
} from '../../../lib/motion/export/protocol.js';

type ExportStartRequest = {
  projectId: string;
  document: MotionDocument;
  presetId: string;
  range: { start: number; end: number };
  outputPath: string;
};

export function registerMotionExportHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  const jobs = new MotionRenderJobs(path.join(app.getPath('userData'), 'motion', 'render-jobs'));
  const assets = getMotionAssetStore();
  const host = new MotionRenderHost({
    jobs,
    mainWindow: () => (mainWindow.isDestroyed() ? null : mainWindow),
    availableAssetIds: async (projectId) => {
      try {
        const inspected = await assets.inspectAssets(projectId);
        return new Set(inspected.filter((asset) => !asset.missing).map((asset) => asset.assetId));
      } catch {
        // No persisted bundle yet: fall back to the snapshot's own asset list.
        return undefined;
      }
    },
  });

  ipcMain.handle('motion:pick-export-path', async (_event, req: { projectName: string; presetId: string }) => {
    const preset = getMotionExportPreset(req.presetId);
    const extension = preset.container === 'webm' ? '.webm' : '.mp4';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Motion composition',
      defaultPath: path.join(app.getPath('downloads'), motionExportFileName(req.projectName, { extension })),
      filters: preset.container === 'webm'
        ? [{ name: 'WebM video', extensions: ['webm'] }]
        : [{ name: 'MP4 video', extensions: ['mp4'] }],
    });
    return result.canceled || !result.filePath ? null : { path: result.filePath };
  });

  ipcMain.handle('motion:export-start', async (_event, req: ExportStartRequest) => host.start(req));

  ipcMain.handle('motion:reveal-export', (_event, req: { path: string }) => {
    if (typeof req?.path === 'string' && path.isAbsolute(req.path)) shell.showItemInFolder(req.path);
  });

  ipcMain.handle('motion:export-cancel', async (_event, req: { jobId: string }) => {
    await host.cancel(parseMotionExportJobRef(req).jobId);
  });

  // ── Hidden renderer only ────────────────────────────────────────────────────
  ipcMain.handle('motion:export-job', async (event, req: { jobId: string }) => {
    return host.payload(parseMotionExportJobRef(req).jobId, event.sender.id);
  });

  ipcMain.handle('motion:export-chunk', async (event, req: unknown) => {
    await host.writeChunk(parseMotionExportChunk(req), event.sender.id);
  });

  ipcMain.handle('motion:export-report', async (event, req: unknown) => {
    return host.reportProgress(parseMotionExportProgress(req), event.sender.id);
  });

  ipcMain.handle('motion:export-complete', async (event, req: { jobId: string }) => {
    const job = await host.complete(parseMotionExportJobRef(req).jobId, event.sender.id);
    return { outputPath: job.outputPath };
  });

  ipcMain.handle('motion:export-failed', async (event, req: unknown) => {
    const failure = parseMotionExportFailure(req);
    await host.fail(failure.jobId, failure.message, event.sender.id);
  });
}
