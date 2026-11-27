/**
 * main/ipc/handlers/trace-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trace video export entry points. The editor only picks a destination and
 * starts a job; progress, chunks, and completion arrive from the hidden render
 * window and are validated by `TraceRenderHost` before touching the output
 * file. Mirrors `handlers/motion-export.ts`.
 */

import path from 'node:path';
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';

import { TraceRenderHost } from '../../trace/render-host.js';
import { TraceRenderJobs } from '../../trace/render-jobs.js';
import type { TraceProject } from '../../../lib/trace/types';
import {
  getTraceExportPreset,
  traceExportFileName,
} from '../../../lib/trace/export/presets.js';
import {
  parseTraceExportChunk,
  parseTraceExportFailure,
  parseTraceExportJobRef,
  parseTraceExportProgress,
} from '../../../lib/trace/export/protocol.js';

type ExportStartRequest = {
  projectId: string;
  project: TraceProject;
  presetId: string;
  outputPath: string;
};

export function registerTraceExportHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const jobs = new TraceRenderJobs(
    path.join(app.getPath('userData'), 'trace', 'render-jobs'),
  );
  const host = new TraceRenderHost({
    jobs,
    mainWindow: () => (mainWindow.isDestroyed() ? null : mainWindow),
  });

  ipcMain.handle(
    'trace:pick-export-path',
    async (
      _event,
      req: { projectName: string; presetId?: string },
    ) => {
      const preset = getTraceExportPreset(req?.presetId);
      const extension =
        preset.container === 'webm' ? '.webm' : '.mp4';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Trace composition',
        defaultPath: path.join(
          app.getPath('downloads'),
          traceExportFileName(req?.projectName ?? '', { extension }),
        ),
        filters:
          preset.container === 'webm'
            ? [{ name: 'WebM video', extensions: ['webm'] }]
            : [{ name: 'MP4 video', extensions: ['mp4'] }],
      });
      return result.canceled || !result.filePath ? null : { path: result.filePath };
    },
  );

  ipcMain.handle('trace:export-start', async (_event, req: ExportStartRequest) =>
    host.start(req),
  );

  ipcMain.handle(
    'trace:reveal-export',
    (_event, req: { path: string }) => {
      if (typeof req?.path === 'string' && path.isAbsolute(req.path)) {
        shell.showItemInFolder(req.path);
      }
    },
  );

  ipcMain.handle('trace:export-cancel', async (_event, req: { jobId: string }) => {
    await host.cancel(parseTraceExportJobRef(req).jobId);
  });

  // ── Hidden renderer only ────────────────────────────────────────────────────
  ipcMain.handle(
    'trace:export-job',
    async (event, req: { jobId: string }) =>
      host.payload(parseTraceExportJobRef(req).jobId, event.sender.id),
  );

  ipcMain.handle('trace:export-chunk', async (event, req: unknown) => {
    await host.writeChunk(parseTraceExportChunk(req), event.sender.id);
  });

  ipcMain.handle('trace:export-report', async (event, req: unknown) => {
    return host.reportProgress(parseTraceExportProgress(req), event.sender.id);
  });

  ipcMain.handle(
    'trace:export-complete',
    async (event, req: { jobId: string }) => {
      const job = await host.complete(
        parseTraceExportJobRef(req).jobId,
        event.sender.id,
      );
      return { outputPath: job.outputPath };
    },
  );

  ipcMain.handle('trace:export-failed', async (event, req: unknown) => {
    const failure = parseTraceExportFailure(req);
    await host.fail(failure.jobId, failure.message, event.sender.id);
  });
}