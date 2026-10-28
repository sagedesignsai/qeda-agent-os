/**
 * tools/studio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio Copilot AI Tools — verbs allowing an autonomous agent to inspect,
 * edit, trim, zoom, subtitle, style, and market screen recordings.
 *
 * All timeline and styling tools execute autonomously and immediately notify
 * the renderer via broadcastChanged() to refresh 60fps canvas previews.
 *
 * Two surfaces instantiate this factory. The Studio copilot always has an open
 * take and gets the repo/filesystem context tools on top. The chat agent has no
 * open take — it recorded one with the computer-use recorder — so it passes
 * `takeId` per call and falls back to the most recent take when it does not,
 * which is what makes "edit the demo we just recorded" work without the agent
 * having to thread an id through every call.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import {
  getStudioTake,
  listStudioTakes,
  saveStudioTake,
  type StudioTake,
  type StudioZoom,
  type StudioCut,
  type StudioCaption,
  type StudioEffect,
  type MouseTrackerEvent,
} from '../db/studio-store.js';
import type { StudioHighlight } from '../studio-recorder.js';
import { getProject } from '../db/projects.js';
import { repoTools } from './repo.js';
import { filesystemTools } from './filesystem.js';

export function getStudioStorageDir(takeId?: string): string {
  const base = path.join(app.getPath('userData'), 'studio');
  return takeId ? path.join(base, takeId) : base;
}

/**
 * Default invalidation broadcast for surfaces with no window handle of their
 * own — the chat agent, which edits takes while Studio is not even mounted.
 *
 * Late-bound and swallowed because the tool registry is imported by tests that
 * never mock BrowserWindow, whereas a silent no-op here only costs a repaint.
 */
export function broadcastStudioChanged(): void {
  try {
    const { BrowserWindow } = require('electron');
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('studio:changed');
    }
  } catch {
    // No window is listening; the take is persisted regardless.
  }
}

export interface CreateStudioToolsOptions {
  /** Take a call acts on when it omits `takeId`. Absent on the chat surface. */
  activeTakeId?: string;
  /** Resolve to the newest take when no id is given (the chat surface). */
  defaultToLatestTake?: boolean;
  /** Include git/grep/file context tools; the copilot wants them, chat has its own. */
  includeContextTools?: boolean;
  broadcastChanged?: () => void;
}

export function createStudioTools({
  activeTakeId,
  defaultToLatestTake = false,
  includeContextTools = true,
  broadcastChanged,
}: CreateStudioToolsOptions) {
  const resolveTake = (id?: string): StudioTake | null => {
    const target = id || activeTakeId;
    if (target) return getStudioTake(target);
    if (!defaultToLatestTake) return null;
    const latest = listStudioTakes(null, 1, 0)[0];
    return latest ? getStudioTake(latest.id) : null;
  };

  /**
   * Highlights the recorder marked during capture, read back from the take's
   * directory. They are the agent's timing anchors: the label is the caption it
   * already chose, so re-reading them beats re-deriving the narrative.
   */
  const readHighlights = async (
    take: StudioTake,
  ): Promise<StudioHighlight[]> => {
    try {
      const file = path.join(getStudioStorageDir(take.id), 'highlights.json');
      return JSON.parse(await fs.readFile(file, 'utf-8')) as StudioHighlight[];
    } catch {
      return [];
    }
  };

  const notify = () => {
    (broadcastChanged ?? broadcastStudioChanged)();
  };

  return {
    // ─── 1. Take & Telemetry Inspection ───────────────────────────────────────

    getTakeDetails: tool({
      description:
        'Inspect the active recording take: retrieves duration, cuts, kinetic zooms, captions, styling, and associated project metadata.',
      inputSchema: z.object({
        takeId: z
          .string()
          .optional()
          .describe('Take ID to inspect (defaults to active take)'),
      }),
      execute: async ({ takeId }) => {
        const take = resolveTake(takeId);
        if (!take) {
          return {
            success: false,
            error: `Take ${takeId || activeTakeId || '(latest)'} not found. Pass a takeId, or record one first with startDemoRecording.`,
          };
        }

        const highlights = await readHighlights(take);

        let projectInfo = null;
        if (take.projectId) {
          const p = getProject(take.projectId);
          if (p) {
            projectInfo = {
              id: p.id,
              name: p.name,
              description: p.description,
            };
          }
        }

        return {
          success: true,
          take: {
            id: take.id,
            title: take.title,
            description: take.description,
            videoPath: take.videoPath,
            durationMs: take.durationMs,
            durationSec: Number((take.durationMs / 1000).toFixed(2)),
            highlights,
            styling: take.styling,
            cutCount: take.cuts.length,
            cuts: take.cuts,
            zoomCount: take.zooms.length,
            zooms: take.zooms,
            captionCount: take.captions.length,
            captions: take.captions,
            effectCount: (take.effects ?? []).length,
            effects: take.effects ?? [],
            overlayCount: (take.overlays ?? []).length,
            overlays: take.overlays ?? [],
            socialKit: take.socialKit,
            project: projectInfo,
          },
        };
      },
    }),

    getMouseTelemetry: tool({
      description:
        'Reads mouse cursor tracking data (dwell points, clicks, and coordinate trajectories) to intelligently locate where key action occurred on screen.',
      inputSchema: z.object({
        takeId: z
          .string()
          .optional()
          .describe('Take ID (defaults to active take)'),
      }),
      execute: async ({ takeId }) => {
        const take = resolveTake(takeId);
        if (!take) {
          return { success: false, error: 'Take not found' };
        }

        try {
          const eventsPath =
            take.mouseEventsPath ||
            path.join(getStudioStorageDir(take.id), 'mouse_events.json');
          const data = await fs.readFile(eventsPath, 'utf-8');
          const events = JSON.parse(data) as MouseTrackerEvent[];

          if (events.length === 0) {
            return {
              success: true,
              totalEvents: 0,
              summary:
                'No mouse events recorded. Use synthetic center framing for kinetic zooms.',
              dwellClusters: [],
            };
          }

          // Compute cluster centroids where user moved or clicked
          const clusters: {
            startMs: number;
            endMs: number;
            avgNormX: number;
            avgNormY: number;
            clickCount: number;
          }[] = [];

          const windowMs = 2000;
          for (let t = 0; t < take.durationMs; t += windowMs) {
            const windowEvents = events.filter(
              (e) => e.t >= t && e.t < t + windowMs,
            );
            if (windowEvents.length >= 3) {
              const avgX =
                windowEvents.reduce((acc, c) => acc + c.x, 0) /
                windowEvents.length;
              const avgY =
                windowEvents.reduce((acc, c) => acc + c.y, 0) /
                windowEvents.length;
              const clicks = windowEvents.filter(
                (e) => e.type === 'click' || e.type === 'mousedown',
              ).length;

              // Normalized coordinates clamped between 0.15 and 0.85
              const normX = Math.max(0.15, Math.min(0.85, avgX / 1920));
              const normY = Math.max(0.15, Math.min(0.85, avgY / 1080));

              clusters.push({
                startMs: t,
                endMs: Math.min(t + windowMs, take.durationMs),
                avgNormX: Number(normX.toFixed(2)),
                avgNormY: Number(normY.toFixed(2)),
                clickCount: clicks,
              });
            }
          }

          return {
            success: true,
            totalEvents: events.length,
            durationMs: take.durationMs,
            dwellClusters: clusters.slice(0, 15),
          };
        } catch {
          return {
            success: true,
            totalEvents: 0,
            summary:
              'Mouse telemetry file not present. Center framing recommended.',
            dwellClusters: [],
          };
        }
      },
    }),

    // ─── 2. Kinetic Zoom Editing ──────────────────────────────────────────────

    addKineticZoom: tool({
      description:
        'Adds a kinetic zoom keyframe to magnify a focal screen region during a specific time interval.',
      inputSchema: z.object({
        startMs: z
          .number()
          .describe('Start timecode of the zoom in milliseconds'),
        endMs: z.number().describe('End timecode of the zoom in milliseconds'),
        scale: z
          .number()
          .min(1.1)
          .max(3.0)
          .default(1.5)
          .describe('Zoom magnification level (1.1x to 3.0x, default 1.5x)'),
        targetX: z
          .number()
          .min(0)
          .max(1)
          .default(0.5)
          .describe(
            'Horizontal focal center [0 = left, 1 = right, default 0.5]',
          ),
        targetY: z
          .number()
          .min(0)
          .max(1)
          .default(0.5)
          .describe('Vertical focal center [0 = top, 1 = bottom, default 0.5]'),
        reason: z
          .string()
          .optional()
          .describe(
            'Rationale for the zoom (e.g. "Highlight compiler output")',
          ),
        takeId: z.string().optional(),
      }),
      execute: async ({
        startMs,
        endMs,
        scale,
        targetX,
        targetY,
        reason,
        takeId,
      }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };

        if (endMs <= startMs) {
          return {
            success: false,
            error: 'endMs must be strictly greater than startMs',
          };
        }

        const newZoom: StudioZoom = {
          id: nanoid(),
          startMs: Math.max(0, Math.round(startMs)),
          endMs: Math.min(take.durationMs, Math.round(endMs)),
          scale: Number(scale.toFixed(1)),
          targetX: Number(Math.max(0, Math.min(1, targetX)).toFixed(2)),
          targetY: Number(Math.max(0, Math.min(1, targetY)).toFixed(2)),
        };

        const updatedZooms = [...take.zooms, newZoom].sort(
          (a, b) => a.startMs - b.startMs,
        );
        saveStudioTake({
          ...take,
          zooms: updatedZooms,
        });

        notify();

        return {
          success: true,
          addedZoom: newZoom,
          totalZooms: updatedZooms.length,
          note: `Added kinetic zoom ${newZoom.scale}x from ${newZoom.startMs}ms to ${newZoom.endMs}ms at (${newZoom.targetX}, ${newZoom.targetY})${reason ? `: ${reason}` : ''}`,
        };
      },
    }),

    removeKineticZoom: tool({
      description:
        'Removes a specific kinetic zoom keyframe or clears all zooms from the timeline.',
      inputSchema: z.object({
        zoomId: z
          .string()
          .optional()
          .describe('ID of the zoom keyframe to delete'),
        clearAll: z.boolean().optional().describe('If true, removes all zooms'),
        takeId: z.string().optional(),
      }),
      execute: async ({ zoomId, clearAll, takeId }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };

        let updatedZooms: StudioZoom[];
        if (clearAll) {
          updatedZooms = [];
        } else if (zoomId) {
          updatedZooms = take.zooms.filter((zoom) => zoom.id !== zoomId);
        } else {
          return {
            success: false,
            error: 'Specify either zoomId or clearAll: true',
          };
        }

        saveStudioTake({
          ...take,
          zooms: updatedZooms,
        });

        notify();

        return {
          success: true,
          remainingZooms: updatedZooms.length,
          note: clearAll
            ? 'Cleared all kinetic zooms'
            : `Removed zoom ${zoomId}`,
        };
      },
    }),

    // ─── 2b. Canvas Effect Passes ─────────────────────────────────────────────

    addCanvasEffect: tool({
      description:
        'Adds a timed canvas compositing effect (spotlight, neon-glow, vignette, film-grain, scanlines) over the framed video.',
      inputSchema: z.object({
        type: z
          .enum([
            'spotlight',
            'neon-glow',
            'vignette',
            'film-grain',
            'scanlines',
          ])
          .describe('Which compositing pass to add'),
        startMs: z.number().describe('Start timecode in milliseconds'),
        endMs: z.number().describe('End timecode in milliseconds'),
        intensity: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Effect strength 0..1 (default 0.6)'),
        takeId: z.string().optional(),
      }),
      execute: async ({ type, startMs, endMs, intensity, takeId }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };
        if (endMs <= startMs) {
          return {
            success: false,
            error: 'endMs must be strictly greater than startMs',
          };
        }

        const effect: StudioEffect = {
          id: nanoid(),
          type,
          startMs: Math.max(0, Math.round(startMs)),
          endMs: Math.min(take.durationMs, Math.round(endMs)),
          intensity: Number((intensity ?? 0.6).toFixed(2)),
        };
        const updatedEffects = [...(take.effects ?? []), effect].sort(
          (a, b) => a.startMs - b.startMs,
        );
        saveStudioTake({ ...take, effects: updatedEffects });
        notify();

        return {
          success: true,
          addedEffect: effect,
          totalEffects: updatedEffects.length,
          note: `Added ${type} effect (intensity ${effect.intensity}) from ${effect.startMs}ms to ${effect.endMs}ms.`,
        };
      },
    }),

    removeCanvasEffect: tool({
      description:
        'Removes a canvas effect by id, or clears every canvas effect from the timeline.',
      inputSchema: z.object({
        effectId: z.string().optional().describe('ID of the effect to remove'),
        clearAll: z
          .boolean()
          .optional()
          .describe('If true, removes all canvas effects'),
        takeId: z.string().optional(),
      }),
      execute: async ({ effectId, clearAll, takeId }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };
        if (!clearAll && !effectId) {
          return {
            success: false,
            error: 'Specify either effectId or clearAll: true',
          };
        }

        const updatedEffects = clearAll
          ? []
          : (take.effects ?? []).filter((effect) => effect.id !== effectId);
        saveStudioTake({ ...take, effects: updatedEffects });
        notify();

        return {
          success: true,
          remainingEffects: updatedEffects.length,
          note: clearAll
            ? 'Cleared all canvas effects'
            : `Removed effect ${effectId}`,
        };
      },
    }),

    // ─── 3. Silence / Cut Editing ─────────────────────────────────────────────

    cutSilenceOrRange: tool({
      description:
        'Marks a time interval as cut/pruned (e.g. dead air, pause, or hesitation) so playback and exports skip it seamlessly.',
      inputSchema: z.object({
        startMs: z
          .number()
          .describe('Start timecode of the cut in milliseconds'),
        endMs: z.number().describe('End timecode of the cut in milliseconds'),
        reason: z
          .enum(['silence', 'manual', 'idle'])
          .optional()
          .describe('Reason for the cut (silence, manual, or idle)'),
        takeId: z.string().optional(),
      }),
      execute: async ({ startMs, endMs, reason, takeId }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };

        if (endMs <= startMs) {
          return {
            success: false,
            error: 'endMs must be greater than startMs',
          };
        }

        const newCut: StudioCut = {
          id: nanoid(),
          startMs: Math.max(0, Math.round(startMs)),
          endMs: Math.min(take.durationMs, Math.round(endMs)),
          reason: reason || 'silence',
        };

        const updatedCuts = [...take.cuts, newCut].sort(
          (a, b) => a.startMs - b.startMs,
        );
        saveStudioTake({
          ...take,
          cuts: updatedCuts,
        });

        notify();

        const prunedMs = newCut.endMs - newCut.startMs;
        return {
          success: true,
          addedCut: newCut,
          totalCuts: updatedCuts.length,
          note: `Pruned ${prunedMs}ms interval (${newCut.startMs}ms - ${newCut.endMs}ms) for: ${newCut.reason}`,
        };
      },
    }),

    // ─── 4. Subtitles & Captions ──────────────────────────────────────────────

    setCaptions: tool({
      description:
        'Sets or replaces subtitles for the video take with timed text and optional word-level karaoke timestamps.',
      inputSchema: z.object({
        captions: z
          .array(
            z.object({
              startMs: z
                .number()
                .describe('Start timecode of caption snippet in milliseconds'),
              endMs: z
                .number()
                .describe('End timecode of caption snippet in milliseconds'),
              text: z.string().describe('Subtitle text content'),
              words: z
                .array(
                  z.object({
                    word: z.string(),
                    startMs: z.number(),
                    endMs: z.number(),
                  }),
                )
                .optional()
                .describe('Optional word-level karaoke sync timestamps'),
            }),
          )
          .describe('List of subtitle snippets'),
        takeId: z.string().optional(),
      }),
      execute: async ({ captions, takeId }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };

        const formattedCaptions: StudioCaption[] = captions.map((c) => ({
          id: nanoid(),
          startMs: Math.max(0, Math.round(c.startMs)),
          endMs: Math.min(take.durationMs, Math.round(c.endMs)),
          text: c.text,
          words: c.words,
        }));

        formattedCaptions.sort((a, b) => a.startMs - b.startMs);

        saveStudioTake({
          ...take,
          captions: formattedCaptions,
          styling: {
            ...take.styling,
            showCaptions: true,
          },
        });

        notify();

        return {
          success: true,
          captionCount: formattedCaptions.length,
          note: `Configured ${formattedCaptions.length} subtitle snippets on the timeline.`,
        };
      },
    }),

    // ─── 5. Showcase Canvas Styling ───────────────────────────────────────────

    updateStyling: tool({
      description:
        'Updates visual showcase styling: aspect ratio, canvas padding, corner radius, wallpaper gradient/solid, and camera easing.',
      inputSchema: z.object({
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1', '4:3'])
          .optional()
          .describe('Video aspect ratio'),
        padding: z
          .number()
          .min(10)
          .max(65)
          .optional()
          .describe('Canvas inset padding percentage (10% to 65%)'),
        borderRadius: z
          .number()
          .min(0)
          .max(32)
          .optional()
          .describe('Video corner radius in pixels (0 to 32px)'),
        background: z
          .string()
          .optional()
          .describe(
            'Wallpaper gradient or hex color (e.g. "linear-gradient(135deg, #1e1b4b, #0f172a)")',
          ),
        cameraEasing: z
          .enum(['smooth', 'snappy', 'cinematic'])
          .optional()
          .describe('Kinetic camera motion curve'),
        zoomIntensity: z
          .number()
          .min(1.1)
          .max(2.4)
          .optional()
          .describe('Global camera zoom intensity (1.1x to 2.4x)'),
        showCaptions: z
          .boolean()
          .optional()
          .describe('Whether subtitles are enabled'),
        captionStyle: z
          .enum(['karaoke', 'minimal', 'badge'])
          .optional()
          .describe('Subtitle visual presentation style'),
        shadow: z
          .string()
          .optional()
          .describe('Drop shadow preset or CSS shadow string'),
        takeId: z.string().optional(),
      }),
      execute: async ({
        aspectRatio,
        padding,
        borderRadius,
        background,
        cameraEasing,
        zoomIntensity,
        showCaptions,
        captionStyle,
        shadow,
        takeId,
      }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };

        const updatedStyling = {
          ...take.styling,
          ...(aspectRatio !== undefined && { aspectRatio }),
          ...(padding !== undefined && { padding }),
          ...(borderRadius !== undefined && { borderRadius }),
          ...(background !== undefined && { background }),
          ...(cameraEasing !== undefined && { cameraEasing }),
          ...(zoomIntensity !== undefined && { zoomIntensity }),
          ...(showCaptions !== undefined && { showCaptions }),
          ...(captionStyle !== undefined && { captionStyle }),
          ...(shadow !== undefined && { shadow }),
        };

        saveStudioTake({
          ...take,
          styling: updatedStyling,
        });

        notify();

        return {
          success: true,
          styling: updatedStyling,
          note: 'Showcase canvas styling updated successfully.',
        };
      },
    }),

    // ─── 6. AI Social Release Kit ─────────────────────────────────────────────

    generateSocialKit: tool({
      description:
        'Saves a generated social release kit (headline, summary, X/Twitter post, changelog, LinkedIn update) into the take record.',
      inputSchema: z.object({
        title: z.string().describe('Catchy headline for the showcase release'),
        summary: z
          .string()
          .describe('2-3 sentence overview of what is demonstrated'),
        tweet: z
          .string()
          .describe(
            'Compelling X/Twitter post with hook, bullet points, and hashtags',
          ),
        changelog: z
          .string()
          .describe(
            'Clean GitHub release markdown entry with bold feature notes',
          ),
        linkedIn: z.string().describe('Professional LinkedIn announcement'),
        takeId: z.string().optional(),
      }),
      execute: async ({
        title,
        summary,
        tweet,
        changelog,
        linkedIn,
        takeId,
      }) => {
        const take = resolveTake(takeId);
        if (!take) return { success: false, error: 'Take not found' };

        const socialKit = {
          title,
          summary,
          tweet,
          changelog,
          linkedIn,
        };

        saveStudioTake({
          ...take,
          socialKit,
        });

        notify();

        return {
          success: true,
          socialKit,
          note: `Saved AI Social Release Kit for "${title}".`,
        };
      },
    }),

    // ─── 7. Context Tools ─────────────────────────────────────────────────────
    // Only for the Studio copilot, which reasons about the codebase behind the
    // demo. The chat agent already has these names from its own groups, and
    // spreading them twice would make the registry lie about its shape.
    ...(includeContextTools
      ? {
          gitStatus: repoTools.gitStatus,
          gitLog: repoTools.gitLog,
          gitDiffStat: repoTools.gitDiffStat,
          grepSearch: repoTools.grepSearch,
          readFile: filesystemTools.readFile,
          listDir: filesystemTools.listDir,
        }
      : {}),
  };
}
