/**
 * ipc/handlers/serper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for Serper web asset search and local resource downloading.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, app, type BrowserWindow } from 'electron';
import path from 'node:path';
import { resolveService } from '../../services/keys.js';
import {
  serperImages,
  type ImageFormatFilter,
} from '../../services/serper.js';
import {
  downloadResource,
  type DownloadResourceResult,
} from '../../services/downloader.js';
import { getProject } from '../../db/projects.js';

export function registerSerperHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'serper:search-images',
    async (
      _e,
      req: {
        query: string;
        count?: number;
        formatFilter?: ImageFormatFilter;
        country?: string;
      },
    ) => {
      try {
        const resolved = resolveService('serper');
        if (!resolved.ok) {
          return {
            success: false,
            total: 0,
            images: [],
            error: resolved.error,
          };
        }

        const result = await serperImages({
          query: req.query,
          count: req.count ?? 16,
          formatFilter: req.formatFilter ?? 'all',
          country: req.country,
          apiKey: resolved.value.apiKey,
        });

        return {
          success: true,
          total: result.total,
          images: result.images,
        };
      } catch (err) {
        return {
          success: false,
          total: 0,
          images: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    'serper:download-asset',
    async (
      _e,
      req: {
        url: string;
        projectId?: string;
        studioTakeId?: string;
        filename?: string;
        targetFolder?: string;
        overwrite?: boolean;
      },
    ): Promise<DownloadResourceResult> => {
      try {
        let destinationDir: string;

        if (req.studioTakeId) {
          destinationDir = path.join(
            app.getPath('userData'),
            'studio',
            req.studioTakeId,
            req.targetFolder || 'assets',
          );
        } else if (req.projectId) {
          const project = getProject(req.projectId);
          if (project?.repo_path) {
            destinationDir = path.resolve(
              project.repo_path,
              req.targetFolder || 'assets',
            );
          } else {
            destinationDir = path.join(
              app.getPath('userData'),
              'projects',
              req.projectId,
              req.targetFolder || 'assets',
            );
          }
        } else {
          try {
            destinationDir = path.join(
              app.getPath('downloads'),
              req.targetFolder || 'docugent-assets',
            );
          } catch {
            destinationDir = path.resolve(
              process.cwd(),
              req.targetFolder || 'assets',
            );
          }
        }

        const result = await downloadResource({
          url: req.url,
          destinationDir,
          filename: req.filename,
          overwrite: req.overwrite,
        });

        if (result.success && req.studioTakeId && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('studio:changed');
        }

        return result;
      } catch (err) {
        return {
          success: false,
          url: req.url,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}
