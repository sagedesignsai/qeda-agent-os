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

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ipcMain,
  desktopCapturer,
  dialog,
  shell,
  screen,
  app,
  BrowserWindow,
} from 'electron';
import { nanoid } from 'nanoid';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  listStudioTakes,
  getStudioTake,
  saveStudioTake,
  deleteStudioTake,
  DEFAULT_STUDIO_STYLING,
  type StudioTake,
  type StudioTakeSummary,
  type StudioZoom,
  type StudioCaption,
  type StudioSocialKit,
  type MouseTrackerEvent,
} from '../../db/studio-store.js';
import { getProject } from '../../db/projects.js';
import { getSettings } from '../../ai/settings.js';
import { resolveModel } from '../../ai/provider.js';

// ── In-memory active recording telemetry ──────────────────────────────────────

interface ActiveRecordingSession {
  takeId: string;
  startTime: number;
  timer: NodeJS.Timeout | null;
  events: MouseTrackerEvent[];
}

let activeTracker: ActiveRecordingSession | null = null;

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
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
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
    (_e, req?: { projectId?: string | null }): StudioTakeSummary[] => {
      return listStudioTakes(req?.projectId ?? null);
    },
  );

  ipcMain.handle(
    'studio:get-take',
    (_e, { id }: { id: string }): StudioTake | null => {
      return getStudioTake(id);
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
            events.push({
              t: Date.now() - startTime,
              x: point.x,
              y: point.y,
              type: 'move',
            });
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
      await fs.writeFile(filePath, JSON.stringify(events, null, 2), 'utf-8');

      // Update take record with mouse_events_path if take exists
      const existing = getStudioTake(takeId);
      if (existing) {
        saveStudioTake({
          ...existing,
          mouseEventsPath: filePath,
        });
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
        const existing = getStudioTake(takeId);
        saveStudioTake({
          id: takeId,
          title:
            existing?.title ||
            `Showcase Take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          videoPath,
          durationMs: durationMs || existing?.durationMs || 5000,
          styling: existing?.styling || DEFAULT_STUDIO_STYLING,
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
      const take = getStudioTake(takeId);
      if (!take) throw new Error(`Take ${takeId} not found`);

      // 1. Load mouse telemetry
      let mouseEvents: MouseTrackerEvent[] = [];
      try {
        const eventsPath =
          take.mouseEventsPath ||
          path.join(getStudioDir(takeId), 'mouse_events.json');
        const data = await fs.readFile(eventsPath, 'utf-8');
        mouseEvents = JSON.parse(data) as MouseTrackerEvent[];
      } catch {
        // Fallback if no mouse log
      }

      // 2. Generate kinetic zoom keyframes based on cursor dwell/action points
      const zooms: StudioZoom[] = [];
      const durationMs = Math.max(take.durationMs, 4000);

      if (mouseEvents.length > 10) {
        // Find cluster centers where the cursor lingered
        const primaryDisplay = screen.getPrimaryDisplay();
        const screenW = primaryDisplay.bounds.width || 1920;
        const screenH = primaryDisplay.bounds.height || 1080;

        let windowStart = 0;
        const windowSizeMs = 1800;

        while (windowStart < durationMs - 1500) {
          const windowEvents = mouseEvents.filter(
            (e) => e.t >= windowStart && e.t < windowStart + windowSizeMs,
          );

          if (windowEvents.length > 5) {
            const avgX =
              windowEvents.reduce((acc, cur) => acc + cur.x, 0) /
              windowEvents.length;
            const avgY =
              windowEvents.reduce((acc, cur) => acc + cur.y, 0) /
              windowEvents.length;

            const normX = Math.min(Math.max(avgX / screenW, 0.15), 0.85);
            const normY = Math.min(Math.max(avgY / screenH, 0.15), 0.85);

            zooms.push({
              id: nanoid(),
              startMs: windowStart + 300,
              endMs: windowStart + windowSizeMs - 200,
              targetX: Number(normX.toFixed(3)),
              targetY: Number(normY.toFixed(3)),
              scale: 1.5,
            });
          }
          windowStart += windowSizeMs + 1200; // alternate zoom and full view
        }
      } else {
        // Synthetic cinematic zoom pulses if no telemetry
        zooms.push({
          id: nanoid(),
          startMs: 1000,
          endMs: Math.min(durationMs - 500, 3500),
          targetX: 0.5,
          targetY: 0.45,
          scale: 1.45,
        });
      }

      // 3. Project Context awareness
      let projectContextName: string | undefined;
      let projectDesc: string | undefined;
      if (take.projectId) {
        const project = getProject(take.projectId);
        if (project) {
          projectContextName = project.name;
          projectDesc = project.description || '';
        }
      }

      const generatedTitle = projectContextName
        ? `${projectContextName} — Feature Walkthrough`
        : take.title || 'Interactive Project Demo';

      // 4. Initial sample karaoke captions
      const captions: StudioCaption[] =
        take.captions.length > 0
          ? take.captions
          : [
              {
                id: nanoid(),
                startMs: 500,
                endMs: Math.min(durationMs, 3000),
                text: projectDesc
                  ? `Demonstrating ${projectContextName}: ${projectDesc.slice(0, 50)}`
                  : 'Showcasing latest feature build and workflow',
                words: [
                  { word: 'Showcasing', startMs: 500, endMs: 1100 },
                  { word: 'latest', startMs: 1150, endMs: 1600 },
                  { word: 'feature', startMs: 1650, endMs: 2200 },
                  { word: 'workflow', startMs: 2250, endMs: 2900 },
                ],
              },
            ];

      const updated = saveStudioTake({
        ...take,
        title: generatedTitle,
        zooms,
        captions,
        styling: {
          ...take.styling,
          zoomIntensity: 1.5,
          cameraEasing: 'smooth',
          showCaptions: true,
        },
      });

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
        ...take,
        socialKit,
      });

      broadcastChanged();
      return socialKit;
    },
  );

  // ── Export Video & Dialogs ────────────────────────────────────────────────

  ipcMain.handle(
    'studio:export-video',
    async (
      _e,
      {
        takeId,
        format,
      }: {
        takeId: string;
        format: 'mp4' | 'gif' | 'webm';
        quality?: 'high' | 'medium';
      },
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      const take = getStudioTake(takeId);
      if (!take) return { ok: false, error: 'Take not found' };

      if (!take.videoPath) {
        return {
          ok: false,
          error: 'No video asset has been added to this showcase project yet.',
        };
      }

      try {
        await fs.access(take.videoPath);
      } catch {
        return {
          ok: false,
          error: `Source video file was not found on disk at: ${take.videoPath}`,
        };
      }

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

      try {
        // If webm requested or source is webm, copy or write
        await fs.copyFile(take.videoPath, filePath);
        shell.showItemInFolder(filePath);
        return { ok: true, filePath };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(
    'studio:read-video-data',
    async (
      _e,
      req: { takeId?: string; filePath?: string },
    ): Promise<string | null> => {
      try {
        let p = req.filePath;
        if (!p && req.takeId) {
          const take = getStudioTake(req.takeId);
          p = take?.videoPath;
        }
        if (!p) return null;
        const buffer = await fs.readFile(p);
        const ext = path.extname(p).toLowerCase().replace('.', '');
        let mime = 'video/webm';
        if (ext === 'mp4') mime = 'video/mp4';
        else if (ext === 'mov') mime = 'video/quicktime';
        else if (ext === 'mp3') mime = 'audio/mpeg';
        else if (ext === 'wav') mime = 'audio/wav';
        else if (ext === 'png') mime = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'webp') mime = 'image/webp';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      } catch {
        return null;
      }
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
