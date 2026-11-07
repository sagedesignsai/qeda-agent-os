/**
 * ipc/handlers/project-files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Project File Browser's IPC surface.
 *
 * Scanning is async and can take a second on a large repo, so `project-files:list`
 * triggers it on demand and the renderer shows a loading state. Everything else
 * (roots, counts) is a cheap read so the dialog is never blank while it waits.
 *
 * Text previews live here rather than on the media host on purpose: the host
 * streams bytes for <img>/<video>/<audio>, while a text preview has to enforce a
 * size cap and refuse binaries. Keeping that policy in one handler is simpler
 * than teaching the range server about content sniffing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  findProjectFileRecord,
  getProjectFileScan,
  listProjectFiles,
  projectFileCounts,
  type ProjectFileRecord,
} from '../../db/project-files.js';
import {
  ensureProjectFileCatalog,
  isProjectFileCatalogStale,
  resolveProjectFileRoots,
} from '../../services/project-file-catalog.js';
import { formatFileSize } from '../../../lib/project-files.js';

const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const TEXT_PREVIEW_RETURN_BYTES = 512 * 1024;
const NULL_SNIFF_BYTES = 8 * 1024;

/**
 * Ceiling for inlining an image into a document. The base64 payload is ~4/3 of
 * the file, and it lands in the project JSON, so a runaway photo would bloat
 * every save and export of the document that embeds it.
 */
const EMBED_MAX_BYTES = 8 * 1024 * 1024;

function assetsRootFor(projectId: string): string {
  return path.join(app.getPath('userData'), 'projects', projectId, 'assets');
}

export function registerProjectFilesHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastChanged = (
    projectId: string,
    scannedAt: number,
    fileCount: number,
  ) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project-files:changed', {
        projectId,
        scannedAt,
        fileCount,
      });
    }
  };

  ipcMain.handle(
    'project-files:roots',
    (_event, { projectId }: { projectId: string }) => {
      const scan = getProjectFileScan(projectId);
      return {
        roots: resolveProjectFileRoots(projectId, assetsRootFor(projectId)),
        totals: projectFileCounts(projectId),
        scannedAt: scan?.scanned_at ?? null,
        stale: isProjectFileCatalogStale(projectId),
        truncated: Boolean(scan?.truncated),
      };
    },
  );

  ipcMain.handle(
    'project-files:list',
    async (
      _event,
      req: {
        projectId: string;
        refresh?: boolean;
        [key: string]: unknown;
      },
    ) => {
      const summary = await ensureProjectFileCatalog(req.projectId, {
        assetsRoot: assetsRootFor(req.projectId),
        refresh: req.refresh,
      });

      if (summary.scanned) {
        broadcastChanged(req.projectId, summary.scannedAt, summary.fileCount);
      }

      return listProjectFiles(req);
    },
  );

  ipcMain.handle(
    'project-files:read-text',
    async (
      _event,
      { projectId, fileId }: { projectId: string; fileId: string },
    ) => {
      const record = requireRecord(projectId, fileId);

      // Vector artwork is read as text so the Trace editor can parse it into
      // elements; everything else must be a plain-text kind.
      const isSvg = record.mime_type === 'image/svg+xml';
      const readableAsText = record.kind === 'text' || isSvg;
      if (!readableAsText) {
        throw new Error('Only text and SVG files can be previewed as text.');
      }

      const stat = await fs.stat(record.path);
      if (!stat.isFile()) throw new Error('Not a file.');

      if (stat.size > TEXT_PREVIEW_MAX_BYTES) {
        throw new Error(
          `This file is too large to preview (${formatFileSize(stat.size)}).`,
        );
      }

      // A text preview is paged; an SVG import must be whole or the parser
      // would see a truncated document.
      const returnLimit = isSvg
        ? TEXT_PREVIEW_MAX_BYTES
        : TEXT_PREVIEW_RETURN_BYTES;
      const length = Math.min(stat.size, returnLimit);
      const buffer = Buffer.alloc(length);
      const handle = await fs.open(record.path, 'r');
      try {
        await handle.read(buffer, 0, length, 0);
      } finally {
        await handle.close();
      }

      if (buffer.subarray(0, NULL_SNIFF_BYTES).includes(0)) {
        throw new Error('This looks like a binary file.');
      }

      return {
        text: buffer.toString('utf8'),
        truncated: stat.size > returnLimit,
        sizeBytes: stat.size,
      };
    },
  );

  ipcMain.handle(
    'project-files:read-data-url',
    async (
      _event,
      { projectId, fileId }: { projectId: string; fileId: string },
    ) => {
      const record = requireRecord(projectId, fileId);
      const mimeType = record.mime_type ?? 'application/octet-stream';

      if (record.kind !== 'image' || !mimeType.startsWith('image/')) {
        throw new Error('Only image files can be embedded in a document.');
      }

      const stat = await fs.stat(record.path);
      if (!stat.isFile()) throw new Error('Not a file.');

      if (stat.size > EMBED_MAX_BYTES) {
        throw new Error(
          `This image is too large to embed (${formatFileSize(
            stat.size,
          )}; the limit is ${formatFileSize(EMBED_MAX_BYTES)}).`,
        );
      }

      // Base64 the bytes as they are on disk: an SVG stays byte-identical, and
      // a raster needs no re-encode, so the embedded source matches the file.
      const bytes = await fs.readFile(record.path);
      return {
        dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
        mimeType,
        sizeBytes: stat.size,
      };
    },
  );

  ipcMain.handle(
    'project-files:reveal',
    (_event, { projectId, fileId }: { projectId: string; fileId: string }) => {
      const record = requireRecord(projectId, fileId);
      shell.showItemInFolder(record.path);
      return true;
    },
  );

  ipcMain.handle(
    'project-files:open',
    async (
      _event,
      { projectId, fileId }: { projectId: string; fileId: string },
    ) => {
      const record = requireRecord(projectId, fileId);
      const error = await shell.openPath(record.path);
      return error === '';
    },
  );
}

function requireRecord(projectId: string, fileId: string): ProjectFileRecord {
  const record = findProjectFileRecord(projectId, fileId);
  if (!record) {
    throw new Error('That file is not part of this project.');
  }
  if (record.missing_at !== null) {
    throw new Error('That file is missing on disk.');
  }
  return record;
}
