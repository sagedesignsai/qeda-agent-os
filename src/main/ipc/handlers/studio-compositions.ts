import path from 'node:path';
import {
  createWriteStream,
  promises as fs,
  type WriteStream,
} from 'node:fs';
import { finished } from 'node:stream/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { nanoid } from 'nanoid';
import { createStudioCompositionDocument } from '../../../lib/studio/composition.js';
import {
  createStudioCompositionFromTemplate,
  deleteStudioComposition,
  deleteStudioCompositionTemplate,
  getStudioComposition,
  importStudioCompositionImageAsset,
  listStudioCompositions,
  listStudioCompositionTemplates,
  saveStudioComposition,
  saveStudioCompositionAsTemplate,
} from '../../db/studio-compositions.js';
import { getStudioTake, getStudioVideoPath } from '../../db/studio-store.js';
import { transcodeStudioVideo } from '../../studio-export.js';

const activeCompositionStreams = new Map<
  string,
  { stream: WriteStream; filePath: string }
>();

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

export function registerStudioCompositionHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:composition-changed');
    }
  };

  ipcMain.handle(
    'studio:composition-list',
    (_event, request?: { projectId?: string | null }) =>
      listStudioCompositions(request?.projectId ?? null),
  );

  ipcMain.handle('studio:composition-get', (_event, { id }: { id: string }) =>
    getStudioComposition(id),
  );

  ipcMain.handle(
    'studio:composition-create',
    (
      _event,
      request: {
        projectId?: string | null;
        title: string;
        sceneId: 'app-spotlight' | 'desktop-mobile-comparison';
        sourceTakeIds?: string[];
      },
    ) => {
      const takes = (request.sourceTakeIds ?? []).map((id) => {
        const take = getStudioTake(id);
        if (!take) throw new Error(`Studio take ${id} was not found.`);
        if (!take.videoPath) {
          throw new Error(`Studio take "${take.title}" has no video source.`);
        }
        return {
          id: take.id,
          title: take.title,
          durationMs: take.durationMs,
        };
      });

      const composition = saveStudioComposition({
        id: nanoid(),
        projectId: request.projectId ?? null,
        title: request.title,
        document: createStudioCompositionDocument({
          sceneId: request.sceneId,
          takes,
        }),
      });
      broadcastChanged();
      return composition;
    },
  );

  ipcMain.handle(
    'studio:composition-template-list',
    () => listStudioCompositionTemplates(),
  );

  ipcMain.handle(
    'studio:composition-template-save',
    (_event, request: { compositionId: string; title: string }) => {
      const template = saveStudioCompositionAsTemplate({
        ...request,
        id: nanoid(),
      });
      broadcastChanged();
      return template;
    },
  );

  ipcMain.handle(
    'studio:composition-template-delete',
    (_event, { id }: { id: string }) => {
      const deleted = deleteStudioCompositionTemplate(id);
      if (deleted) broadcastChanged();
      return deleted;
    },
  );

  ipcMain.handle(
    'studio:composition-create-from-template',
    (
      _event,
      request: {
        projectId?: string | null;
        title: string;
        templateId: string;
        sourceTakeIds: string[];
      },
    ) => {
      const composition = createStudioCompositionFromTemplate({
        ...request,
        id: nanoid(),
        getTake: (id) => {
          const take = getStudioTake(id);
          if (!take) return null;
          if (!take.videoPath) {
            throw new Error(`Studio take "${take.title}" has no video source.`);
          }
          return {
            id: take.id,
            projectId: take.projectId,
            title: take.title,
            description: take.description,
            sourceType: take.sourceType,
            sourceName: take.sourceName,
            durationMs: take.durationMs,
            videoPath: take.videoPath,
            cutCount: take.cuts.length,
            zoomCount: take.zooms.length,
            fileSizeBytes: take.fileSizeBytes,
            createdAt: take.createdAt,
            updatedAt: take.updatedAt,
            isMultiTrack: Array.isArray(take.tracks) && take.tracks.length > 0,
          };
        },
      });
      broadcastChanged();
      return composition;
    },
  );

  ipcMain.handle(
    'studio:composition-save',
    (
      _event,
      request: {
        id: string;
        title: string;
        document: Parameters<typeof saveStudioComposition>[0]['document'];
      },
    ) => {
      const existing = getStudioComposition(request.id);
      if (!existing) {
        throw new Error(`Studio composition ${request.id} was not found.`);
      }
      const saved = saveStudioComposition({
        id: existing.id,
        projectId: existing.projectId,
        title: request.title,
        document: request.document,
      });
      broadcastChanged();
      return saved;
    },
  );

  ipcMain.handle(
    'studio:composition-import-image',
    async (_event, { id }: { id: string }) => {
      if (!getStudioComposition(id)) {
        throw new Error(`Studio composition ${id} was not found.`);
      }
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Add an image layer',
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: [...IMAGE_EXTENSIONS].map((extension) =>
              extension.slice(1),
            ),
          },
        ],
      });
      const filePath = result.filePaths[0];
      if (result.canceled || !filePath) return null;

      const extension = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        throw new Error('Choose a supported image file.');
      }
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) throw new Error('The selected image is not a file.');

      const asset = importStudioCompositionImageAsset({
        id: nanoid(),
        compositionId: id,
        name: path.basename(filePath),
        path: filePath,
      });
      broadcastChanged();
      return asset;
    },
  );

  ipcMain.handle(
    'studio:composition-save-rendered-chunk',
    async (
      _event,
      request: {
        compositionId: string;
        chunkBase64?: string;
        chunk?: ArrayBuffer | Uint8Array;
        isFirst?: boolean;
        isLast: boolean;
      },
    ) => {
      if (!getStudioComposition(request.compositionId)) {
        throw new Error(
          `Studio composition ${request.compositionId} was not found.`,
        );
      }
      const directory = path.join(
        app.getPath('userData'),
        'studio',
        'compositions',
        request.compositionId,
      );
      await fs.mkdir(directory, { recursive: true });
      const filePath = path.join(directory, 'rendered.webm');
      let entry = activeCompositionStreams.get(request.compositionId);

      if (request.isFirst) {
        entry?.stream.destroy();
        entry = {
          stream: createWriteStream(filePath, { flags: 'w' }),
          filePath,
        };
        entry.stream.on('error', () => {
          if (activeCompositionStreams.get(request.compositionId) === entry) {
            activeCompositionStreams.delete(request.compositionId);
          }
        });
        activeCompositionStreams.set(request.compositionId, entry);
      }
      if (!entry) {
        throw new Error('Composition render stream was not started.');
      }

      const stream = entry.stream;
      let buffer: Buffer | null = null;
      if (request.chunk instanceof Uint8Array) {
        buffer = Buffer.from(request.chunk);
      } else if (request.chunk) {
        buffer = Buffer.from(request.chunk);
      } else if (request.chunkBase64) {
        buffer = Buffer.from(request.chunkBase64, 'base64');
      }
      try {
        if (buffer?.length) {
          await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => reject(error);
            stream.once('error', onError);
            stream.write(buffer, (error) => {
              stream.removeListener('error', onError);
              if (error) reject(error);
              else resolve();
            });
          });
        }

        if (request.isLast) {
          stream.end();
          await finished(stream);
          activeCompositionStreams.delete(request.compositionId);
        }
      } catch (error) {
        if (activeCompositionStreams.get(request.compositionId) === entry) {
          activeCompositionStreams.delete(request.compositionId);
        }
        stream.destroy();
        throw error;
      }
      return { ok: true, filePath: entry.filePath };
    },
  );

  ipcMain.handle(
    'studio:composition-export',
    async (
      _event,
      request: { id: string; format: 'mp4' | 'gif' | 'webm' },
    ): Promise<{
      ok: boolean;
      filePath?: string;
      error?: string;
      canceled?: boolean;
    }> => {
      const composition = getStudioComposition(request.id);
      if (!composition) {
        return { ok: false, error: 'Composition not found.' };
      }
      const directory = path.join(
        app.getPath('userData'),
        'studio',
        'compositions',
        composition.id,
      );
      const inputPath = path.join(directory, 'rendered.webm');
      try {
        await fs.access(inputPath);
      } catch {
        return { ok: false, error: 'Render the composition before exporting.' };
      }

      const defaultName = `${composition.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}.${request.format}`;
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Export composition (${request.format.toUpperCase()})`,
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: [
          { name: request.format.toUpperCase(), extensions: [request.format] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };

      try {
        const audioLayer = composition.document.layers.find(
          (layer) =>
            layer.kind === 'video' &&
            layer.id === composition.document.audioSourceLayerId,
        );
        let audioInputPath: string | undefined;
        let audioTiming:
          | { sourceInMs: number; delayMs: number; durationMs: number }
          | undefined;
        if (audioLayer?.kind === 'video') {
          audioInputPath = getStudioVideoPath(audioLayer.sourceId) ?? undefined;
          if (!audioInputPath) {
            return {
              ok: false,
              error: `Audio source "${audioLayer.name}" is no longer available.`,
            };
          }
          audioTiming = {
            sourceInMs: audioLayer.sourceInMs,
            delayMs: audioLayer.startMs,
            durationMs: audioLayer.endMs - audioLayer.startMs,
          };
        }

        await transcodeStudioVideo({
          inputPath,
          outputPath: filePath,
          format: request.format,
          audioInputPath,
          audioTiming,
          durationMs: composition.document.durationMs,
        });
        await fs.rm(inputPath, { force: true });
        shell.showItemInFolder(filePath);
        return { ok: true, filePath };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'studio:composition-delete',
    (_event, { id }: { id: string }) => {
      const deleted = deleteStudioComposition(id);
      if (deleted) broadcastChanged();
      return deleted;
    },
  );
}
