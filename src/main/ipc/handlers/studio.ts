/**
 * ipc/handlers/studio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handler module for Studio: Showcase Video Generator & Recorder.
 *
 * Handles:
 *   - Desktop & window source enumeration via desktopCapturer
 *   - Mouse cursor telemetry tracking during recording takes
 *   - Saving recorded video stream chunks to userData/studio/
 *   - Autonomous Magic Draft processing (silence cutting, camera zoom curves)
 *   - Project-aware AI social kit generation (changelog, tweet, release notes)
 *   - Export dialogs and OS file reveals
 *   - Broadcasting 'studio:changed' invalidation events
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs, createWriteStream, type WriteStream } from 'node:fs';
import path from 'node:path';
import {
  ipcMain,
  desktopCapturer,
  dialog,
  shell,
  screen,
  app,
  BrowserWindow,
  powerSaveBlocker,
} from 'electron';
import { nanoid } from 'nanoid';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  listStudioTakes,
  getStudioTake,
  getStudioVideoPath,
  hasStudioTake,
  saveStudioTake,
  deleteStudioTake,
  updateStudioTakeMediaPrep,
  DEFAULT_STUDIO_STYLING,
  type StudioTake,
  type StudioTakeSummary,
  type StudioSocialKit,
  type MouseTrackerEvent,
} from '../../db/studio-store.js';
import { getProject } from '../../db/projects.js';
import { getSettings } from '../../ai/settings.js';
import { resolveModel } from '../../ai/provider.js';
import { transcodeStudioVideo } from '../../studio-export.js';
import { processStudioDraft } from '../../studio-draft.js';
import { probeTake, ensureOptimizedMedia } from '../../studio-media-prep.js';
import {
  generateFilmstrip,
  generateWaveform,
  type FilmstripMeta,
} from '../../studio-thumbs.js';

// ── In-memory active recording telemetry ──────────────────────────────────────

interface ActiveRecordingSession {
  takeId: string;
  startTime: number;
  timer: NodeJS.Timeout | null;
  events: MouseTrackerEvent[];
}

let activeTracker: ActiveRecordingSession | null = null;
const MAX_MOUSE_TRACKER_EVENTS = 100_000;

const activeChunkStreams = new Map<
  string,
  { stream: WriteStream; filePath: string }
>();

function getStudioDir(takeId?: string): string {
  const base = path.join(app.getPath('userData'), 'studio');
  return takeId ? path.join(base, takeId) : base;
}

export function registerStudioHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:changed');
    }
  };

  const broadcastProgress = (
    takeId: string,
    stage:
      'probing' | 'optimizing' | 'filmstrip' | 'waveform' | 'ready' | 'error',
    progress: number,
    error?: string,
  ) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:media-progress', {
        takeId,
        stage,
        progress,
        error,
      });
    }
  };

  const prepMediaPipeline = async (
    take: StudioTake,
    force = false,
  ): Promise<void> => {
    try {
      broadcastProgress(take.id, 'probing', 0.1);
      const probe = await probeTake(take.videoPath);
      updateStudioTakeMediaPrep(take.id, { probeJson: JSON.stringify(probe) });

      broadcastProgress(take.id, 'optimizing', 0.3);
      await ensureOptimizedMedia(take, { force });

      const currentTake = getStudioTake(take.id) || take;
      broadcastProgress(take.id, 'filmstrip', 0.6);
      await generateFilmstrip(currentTake);

      broadcastProgress(take.id, 'waveform', 0.8);
      await generateWaveform(currentTake);

      broadcastProgress(take.id, 'ready', 1.0);
    } catch (err: any) {
      broadcastProgress(take.id, 'error', 0, err?.message || String(err));
      throw err;
    }
  };

  // ── Source Enumeration ────────────────────────────────────────────────────

  ipcMain.handle(
    'studio:list-sources',
    async (
      _e,
      req?: { types?: ('screen' | 'window')[] },
    ): Promise<
      Array<{
        id: string;
        name: string;
        thumbnailDataUrl: string;
        displayId?: string;
        appIcon?: string;
      }>
    > => {
      const types = req?.types ?? ['screen', 'window'];
      const sources = await desktopCapturer.getSources({
        types,
        thumbnailSize: { width: 160, height: 90 },
        fetchWindowIcons: false,
      });

      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnailDataUrl: s.thumbnail.toDataURL(),
        displayId: s.display_id,
        appIcon: s.appIcon ? s.appIcon.toDataURL() : undefined,
      }));
    },
  );

  // ── CRUD Takes ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'studio:list-takes',
    (
      _e,
      req?: { projectId?: string | null; limit?: number; offset?: number },
    ): StudioTakeSummary[] => {
      return listStudioTakes(req?.projectId ?? null, req?.limit, req?.offset);
    },
  );

  ipcMain.handle(
    'studio:get-take',
    (_e, { id }: { id: string }): StudioTake | null => {
      const take = getStudioTake(id);
      if (take && !take.mediaReadyAt) {
        // Trigger lazy backfill prep in the background without blocking the return
        void (async () => {
          try {
            await prepMediaPipeline(take);
          } catch (err) {
            console.warn(
              `[studio:media-prep] Lazy backfill failed for ${id}:`,
              err,
            );
          }
        })();
      }
      return take;
    },
  );

  ipcMain.handle(
    'studio:prep-media',
    async (_e, { takeId, force }: { takeId: string; force?: boolean }) => {
      const take = getStudioTake(takeId);
      if (!take) {
        return { ok: false, error: 'Take not found' };
      }
      try {
        await prepMediaPipeline(take, force);
        const updated = getStudioTake(takeId);
        return {
          ok: true,
          probe: updated?.probe,
          optimizedPath: updated?.optimizedPath,
          filmstripPath: updated?.filmstripPath,
          waveformPath: updated?.waveformPath,
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) };
      }
    },
  );

  ipcMain.handle(
    'studio:get-media-sidecars',
    async (_e, { takeId }: { takeId: string }) => {
      const take = getStudioTake(takeId);
      if (!take) {
        return {
          probe: null,
          peaks: null,
          filmstripUrl: null,
          filmstripMeta: null,
        };
      }

      let peaks: number[] | null = null;
      if (take.waveformPath) {
        try {
          const buf = await fs.readFile(take.waveformPath);
          const f32 = new Float32Array(
            buf.buffer,
            buf.byteOffset,
            buf.byteLength / 4,
          );
          peaks = Array.from(f32);
        } catch {
          // Ignore read error
        }
      }

      let filmstripMeta: FilmstripMeta | null = null;
      let filmstripUrl: string | null = null;
      if (take.filmstripPath) {
        try {
          const metaPath = path.join(
            path.dirname(take.filmstripPath),
            'filmstrip.json',
          );
          const metaStr = await fs.readFile(metaPath, 'utf-8');
          filmstripMeta = JSON.parse(metaStr);
          filmstripUrl = `qeda-media://studio/${encodeURIComponent(take.id)}?variant=filmstrip`;
        } catch {
          // Ignore read error
        }
      }

      return {
        probe: take.probe ?? null,
        peaks,
        filmstripUrl,
        filmstripMeta,
      };
    },
  );

  ipcMain.handle(
    'studio:save-take',
    (_e, take: Parameters<typeof saveStudioTake>[0]): StudioTake => {
      const saved = saveStudioTake(take);
      broadcastChanged();
      return saved;
    },
  );

  ipcMain.handle(
    'studio:delete-take',
    async (_e, { id }: { id: string }): Promise<boolean> => {
      const take = getStudioTake(id);
      const ok = deleteStudioTake(id);
      if (ok && take) {
        try {
          const dir = getStudioDir(id);
          await fs.rm(dir, { recursive: true, force: true });
        } catch {
          // Best effort cleanup
        }
        broadcastChanged();
      }
      return ok;
    },
  );

  // ── Mouse Telemetry Tracker ───────────────────────────────────────────────

  ipcMain.handle(
    'studio:start-mouse-tracker',
    (_e, req?: { takeId?: string }): { ok: boolean } => {
      const takeId = req?.takeId || nanoid();
      if (activeTracker?.timer) {
        clearInterval(activeTracker.timer);
      }

      const startTime = Date.now();
      const events: MouseTrackerEvent[] = [];

      let lastX = -1;
      let lastY = -1;

      // Sample cursor at ~50Hz (20ms interval)
      const timer = setInterval(() => {
        try {
          const point = screen.getCursorScreenPoint();
          if (point.x !== lastX || point.y !== lastY) {
            lastX = point.x;
            lastY = point.y;
            if (events.length < MAX_MOUSE_TRACKER_EVENTS) {
              events.push({
                t: Date.now() - startTime,
                x: point.x,
                y: point.y,
                type: 'move',
              });
            }
          }
        } catch {
          // Screen query safe guard
        }
      }, 20);

      activeTracker = {
        takeId,
        startTime,
        timer,
        events,
      };

      return { ok: true };
    },
  );

  ipcMain.handle(
    'studio:stop-mouse-tracker',
    async (
      _e,
      { takeId }: { takeId: string },
    ): Promise<{ ok: boolean; count: number; filePath: string }> => {
      if (activeTracker?.timer) {
        clearInterval(activeTracker.timer);
        activeTracker.timer = null;
      }

      const events =
        activeTracker?.takeId === takeId ? activeTracker.events : [];
      activeTracker = null;

      const takeDir = getStudioDir(takeId);
      await fs.mkdir(takeDir, { recursive: true });

      const filePath = path.join(takeDir, 'mouse_events.json');
      await fs.writeFile(filePath, JSON.stringify(events), 'utf-8');

      // Check existence with a narrow query so this partial save cannot create
      // a phantom take or load/serialize its other large fields.
      if (hasStudioTake(takeId)) {
        saveStudioTake({ id: takeId, mouseEventsPath: filePath });
      }

      return { ok: true, count: events.length, filePath };
    },
  );

  // ── Recording Chunk Persistence ───────────────────────────────────────────

  ipcMain.handle(
    'studio:save-recording-chunk',
    async (
      _e,
      {
        takeId,
        chunkBase64,
        isFirst,
        isLast,
        durationMs,
      }: {
        takeId: string;
        chunkBase64: string;
        isFirst?: boolean;
        isLast: boolean;
        mimeType?: string;
        durationMs?: number;
      },
    ): Promise<{ ok: boolean; videoPath: string; durationMs: number }> => {
      const takeDir = getStudioDir(takeId);
      await fs.mkdir(takeDir, { recursive: true });

      const videoPath = path.join(takeDir, 'recording.webm');
      const buffer = Buffer.from(chunkBase64, 'base64');

      if (isFirst) {
        await fs.writeFile(videoPath, buffer);
      } else {
        await fs.appendFile(videoPath, buffer);
      }

      if (isLast) {
        saveStudioTake({
          id: takeId,
          videoPath,
          durationMs: durationMs || 5000,
        });
        broadcastChanged();
      }

      return { ok: true, videoPath, durationMs: durationMs ?? 0 };
    },
  );

  // ── Retrieve Mouse Events ─────────────────────────────────────────────────

  ipcMain.handle(
    'studio:get-mouse-events',
    async (
      _e,
      { takeId }: { takeId: string },
    ): Promise<MouseTrackerEvent[]> => {
      try {
        const take = getStudioTake(takeId);
        const eventsPath =
          take?.mouseEventsPath ||
          path.join(getStudioDir(takeId), 'mouse_events.json');
        const content = await fs.readFile(eventsPath, 'utf-8');
        return JSON.parse(content) as MouseTrackerEvent[];
      } catch {
        return [];
      }
    },
  );

  // ── Autonomous Magic Draft Processing ─────────────────────────────────────

  ipcMain.handle(
    'studio:process-draft',
    async (_e, { takeId }: { takeId: string }): Promise<StudioTake> => {
      const updated = await processStudioDraft(takeId);
      broadcastChanged();
      return updated;
    },
  );

  // ── AI Social Release Kit ─────────────────────────────────────────────────

  ipcMain.handle(
    'studio:generate-social-kit',
    async (_e, { takeId }: { takeId: string }): Promise<StudioSocialKit> => {
      const take = getStudioTake(takeId);
      if (!take) throw new Error(`Take ${takeId} not found`);

      const settings = getSettings();
      const model = resolveModel(settings.activeProvider, settings.activeModel);

      let projectPrompt = `Showcase Title: ${take.title}`;
      if (take.projectId) {
        const p = getProject(take.projectId);
        if (p) {
          projectPrompt += `\nProject: ${p.name}\nProject Description: ${p.description || 'N/A'}`;
        }
      }

      const schema = z.object({
        title: z
          .string()
          .describe('Punchy, engaging headline for the showcase video'),
        summary: z
          .string()
          .describe(
            '2-3 sentence overview of what is demonstrated in the clip',
          ),
        tweet: z
          .string()
          .describe(
            'Compelling X/Twitter post with hook, 2-3 bullet highlights, and hashtags',
          ),
        changelog: z
          .string()
          .describe(
            'Clean GitHub release / changelog markdown entry with bold feature notes',
          ),
        linkedIn: z
          .string()
          .describe(
            'Engaging LinkedIn professional update about this milestone',
          ),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: `You are an expert developer advocate and product marketer creating a release kit for a screen recording showcase video.\n\nContext:\n${projectPrompt}\nDuration: ${(take.durationMs / 1000).toFixed(1)}s\n\nWrite a high-converting, polished social release kit.`,
      });

      const socialKit = result.object;
      saveStudioTake({
        id: take.id,
        socialKit,
      });

      broadcastChanged();
      return socialKit;
    },
  );

  // ── Export Video & Dialogs ────────────────────────────────────────────────

  ipcMain.handle(
    'studio:prompt-save-dialog',
    async (
      _e,
      {
        takeId,
        format,
        defaultTitle,
      }: {
        takeId: string;
        format: 'mp4' | 'gif' | 'webm';
        defaultTitle?: string;
      },
    ): Promise<{ canceled: boolean; filePath?: string }> => {
      const take = getStudioTake(takeId);
      const title = defaultTitle || take?.title || 'showcase';
      const defaultName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`;
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Export Showcase (${format.toUpperCase()})`,
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: [
          { name: format.toUpperCase(), extensions: [format] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }
      return { canceled: false, filePath };
    },
  );

  ipcMain.handle(
    'studio:save-rendered-chunk',
    async (
      _e,
      {
        takeId,
        chunkBase64,
        chunk,
        isFirst,
        isLast,
      }: {
        takeId: string;
        chunkBase64?: string;
        chunk?: ArrayBuffer | Uint8Array;
        isFirst?: boolean;
        isLast?: boolean;
      },
    ): Promise<{ ok: boolean; filePath: string }> => {
      const takeDir = getStudioDir(takeId);
      await fs.mkdir(takeDir, { recursive: true });

      const renderedPath = path.join(takeDir, 'rendered.webm');
      let entry = activeChunkStreams.get(takeId);

      if (isFirst || !entry) {
        if (entry) {
          try {
            entry.stream.end();
          } catch {
            // Ignore stream close error
          }
        }
        const stream = createWriteStream(renderedPath, { flags: 'w' });
        entry = { stream, filePath: renderedPath };
        activeChunkStreams.set(takeId, entry);
      }

      let buffer: Buffer | null = null;
      if (chunk) {
        buffer = Buffer.isBuffer(chunk)
          ? chunk
          : chunk instanceof Uint8Array
            ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            : Buffer.from(chunk);
      } else if (chunkBase64) {
        buffer = Buffer.from(chunkBase64, 'base64');
      }

      if (buffer && buffer.length > 0) {
        const stream = entry.stream;
        await new Promise<void>((resolve, reject) => {
          const flushed = stream.write(buffer, (err) => {
            if (err) reject(err);
            else resolve();
          });
          if (!flushed) {
            stream.once('drain', resolve);
          }
        });
      }

      if (isLast) {
        const stream = entry.stream;
        await new Promise<void>((resolve) => {
          stream.end(() => resolve());
        });
        activeChunkStreams.delete(takeId);
      }

      return { ok: true, filePath: renderedPath };
    },
  );

  ipcMain.handle(
    'studio:export-video',
    async (
      _e,
      {
        takeId,
        format,
        quality,
        targetPath,
        renderedVideoPath,
      }: {
        takeId: string;
        format: 'mp4' | 'gif' | 'webm';
        quality?: 'high' | 'medium';
        targetPath?: string;
        renderedVideoPath?: string;
      },
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      const take = getStudioTake(takeId);
      if (!take) return { ok: false, error: 'Take not found' };

      const takeDir = getStudioDir(takeId);
      const defaultRenderedPath = path.join(takeDir, 'rendered.webm');
      let effectiveInputPath = renderedVideoPath || '';

      if (!effectiveInputPath) {
        try {
          await fs.access(defaultRenderedPath);
          effectiveInputPath = defaultRenderedPath;
        } catch {
          effectiveInputPath = take.videoPath;
        }
      }

      if (!effectiveInputPath) {
        return {
          ok: false,
          error: 'No video asset has been added to this showcase project yet.',
        };
      }

      try {
        await fs.access(effectiveInputPath);
      } catch {
        return {
          ok: false,
          error: `Source video file was not found on disk at: ${effectiveInputPath}`,
        };
      }

      let finalOutputPath = targetPath;
      if (!finalOutputPath) {
        const defaultName = `${take.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`;
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: `Export Showcase (${format.toUpperCase()})`,
          defaultPath: path.join(app.getPath('downloads'), defaultName),
          filters: [
            { name: format.toUpperCase(), extensions: [format] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (canceled || !filePath) {
          return { ok: false };
        }
        finalOutputPath = filePath;
      }

      let blockerId: number | null = null;
      try {
        blockerId = powerSaveBlocker.start('prevent-app-suspension');
        mainWindow.setProgressBar(0.5);

        // When the renderer has produced a composed rendered.webm, the source
        // video path carries the original audio track. Pass it as audioInputPath
        // so ffmpeg merges the audio with the composed video in one pass.
        // If effectiveInputPath IS the original (no composed render), audio is
        // already embedded so no separate merge is needed.
        const hasComposedRender =
          effectiveInputPath === defaultRenderedPath ||
          effectiveInputPath === (renderedVideoPath || '');
        const audioInputPath =
          hasComposedRender &&
          take.videoPath &&
          take.videoPath !== effectiveInputPath
            ? take.videoPath
            : undefined;

        // Transcode the composed video (or raw fallback) to the requested format
        await transcodeStudioVideo({
          inputPath: effectiveInputPath,
          outputPath: finalOutputPath,
          format,
          quality,
          audioInputPath,
          // The composed render is already cut, so its audio must lose the same
          // ranges. A raw fallback keeps its own length, cuts and all.
          cuts: hasComposedRender ? take.cuts : undefined,
        });

        // Clean up temporary rendered composition WebM
        try {
          await fs.rm(defaultRenderedPath, { force: true });
        } catch {
          // Best effort cleanup
        }

        shell.showItemInFolder(finalOutputPath);
        return { ok: true, filePath: finalOutputPath };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      } finally {
        if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
          powerSaveBlocker.stop(blockerId);
        }
        mainWindow.setProgressBar(-1);
      }
    },
  );

  ipcMain.handle(
    'studio:read-video-data',
    async (_e, req: { takeId?: string }): Promise<string | null> => {
      if (!req.takeId || !getStudioVideoPath(req.takeId)) return null;
      return `qeda-media://studio/${encodeURIComponent(req.takeId)}`;
    },
  );

  ipcMain.handle(
    'studio:create-blank-take',
    async (
      _e,
      req?: { projectId?: string | null; title?: string },
    ): Promise<StudioTake> => {
      const id = nanoid();
      const takeDir = getStudioDir(id);
      await fs.mkdir(takeDir, { recursive: true });

      const dateStr = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const saved = saveStudioTake({
        id,
        projectId: req?.projectId ?? null,
        title: req?.title || `Blank Project (${dateStr})`,
        sourceType: 'screen',
        sourceName: 'Blank Canvas',
        durationMs: 10000,
        videoPath: '',
        styling: DEFAULT_STUDIO_STYLING,
        cuts: [],
        zooms: [],
        captions: [],
      });

      broadcastChanged();
      return saved;
    },
  );

  ipcMain.handle(
    'studio:import-media',
    async (
      _e,
      req?: { types?: ('video' | 'audio' | 'image')[] },
    ): Promise<{
      canceled: boolean;
      files: Array<{
        name: string;
        path: string;
        sizeBytes: number;
        type: 'video' | 'audio' | 'image';
      }>;
    }> => {
      const types = req?.types ?? ['video', 'audio', 'image'];
      const extensions: string[] = [];
      if (types.includes('video')) extensions.push('mp4', 'webm', 'mov', 'mkv');
      if (types.includes('audio'))
        extensions.push('mp3', 'wav', 'aac', 'ogg', 'm4a');
      if (types.includes('image'))
        extensions.push('png', 'jpg', 'jpeg', 'webp', 'gif', 'svg');

      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Media Assets',
        buttonLabel: 'Import Assets',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Media Files', extensions }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, files: [] };
      }

      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          const stats = await fs.stat(filePath);
          const ext = path.extname(filePath).toLowerCase().replace('.', '');
          let mediaType: 'video' | 'audio' | 'image' = 'video';
          if (['mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
            mediaType = 'audio';
          } else if (
            ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)
          ) {
            mediaType = 'image';
          }

          return {
            name: path.basename(filePath),
            path: filePath,
            sizeBytes: stats.size,
            type: mediaType,
          };
        }),
      );

      return { canceled: false, files };
    },
  );

  ipcMain.handle(
    'studio:open-path',
    async (_e, { path: targetPath }: { path: string }): Promise<boolean> => {
      try {
        shell.showItemInFolder(targetPath);
        return true;
      } catch {
        return false;
      }
    },
  );
}
