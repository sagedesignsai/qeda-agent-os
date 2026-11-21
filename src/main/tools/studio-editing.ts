/**
 * tools/studio-editing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-track Studio project editing tools.
 *
 * These are the agent's verbs for building a video from media assets rather
 * than tweaking a single recording: tracks, clips, clip properties, clip
 * effects, effect keyframes, captions, overlays, and recording import.
 *
 * Each tool resolves a take, materializes the project model once (legacy
 * recordings become real tracks), applies a pure edit from
 * `lib/studio/editing`, persists the result, and broadcasts the change so the
 * Studio canvas repaints.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { saveStudioTake, type StudioTake } from '../db/studio-store.js';
import {
  addCaption,
  addClip,
  addClipEffect,
  addClipFromAsset,
  addEffectKeyframe,
  addOverlay,
  autoCreateTracks,
  createTrack,
  deleteTrack,
  describeProject,
  importRecording,
  listEffectCatalog as getEffectCatalog,
  materializeProjectTracks,
  moveClip,
  removeCaption,
  removeClip,
  removeClipEffect,
  removeEffectKeyframe,
  removeOverlay,
  reorderClipEffects,
  reorderTracks,
  setClipProperties,
  updateClipEffect,
  updateTrack,
} from '../../lib/studio/editing/index.js';
import {
  applyShowcasePreset,
  listShowcasePresets as getShowcasePresets,
} from '../../lib/studio/showcase-presets.js';

export interface StudioEditingToolContext {
  /** Resolve the take a call targets; null when there is no open/latest take. */
  resolveTake: (takeId?: string) => StudioTake | null;
  /** Persist a fully edited take and return the saved record. */
  persist?: (take: StudioTake) => StudioTake;
  /** Ask the renderer to repaint the timeline/canvas. */
  notify: () => void;
}

const takeIdSchema = z
  .string()
  .optional()
  .describe('Take/project id (defaults to the active take)');

const trackTypeSchema = z.enum([
  'video',
  'audio',
  'effects',
  'transitions',
  'captions',
  'overlays',
]);

const effectTypeSchema = z.enum([
  'spotlight',
  'neon-glow',
  'vignette',
  'film-grain',
  'scanlines',
]);

const effectParamsSchema = z
  .record(
    z.string(),
    z.union([z.number(), z.string(), z.boolean()]),
  )
  .optional()
  .describe(
    'Effect-specific static parameters. Omit to use the catalog defaults.',
  );

const transformSchema = z
  .object({
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    scale: z.object({ x: z.number(), y: z.number() }).optional(),
    rotation: z.number().optional(),
    anchorPoint: z.object({ x: z.number(), y: z.number() }).optional(),
  })
  .optional()
  .describe('Clip transform: pixel offset, scale, rotation in degrees, anchor 0..1');

const easingSchema = z
  .enum([
    'linear',
    'ease-out',
    'ease-in',
    'ease-in-out',
    'power2.out',
    'power2.in',
    'power2.inOut',
    'power3.out',
    'power3.in',
    'back.out',
    'elastic.out',
    'bounce.out',
    'expo.out',
    'sine.out',
  ])
  .optional();

export function createStudioEditingTools(ctx: StudioEditingToolContext) {
  const persist = (take: StudioTake): StudioTake =>
    (ctx.persist ?? saveStudioTake)(take);

  const resolve = (takeId?: string) => {
    const take = ctx.resolveTake(takeId);
    if (!take) {
      return {
        take: null,
        error: `Take ${takeId || '(active)'} not found. Record or open a Studio project first.`,
      } as const;
    }
    return { take, error: null } as const;
  };

  const commit = (take: StudioTake) => {
    const saved = persist(take);
    ctx.notify();
    return saved;
  };

  return {
    // ─── Project state & catalog ─────────────────────────────────────────────

    getProjectState: tool({
      description:
        'Inspect the full multi-track project: styling, media pool, every track and clip, clip effects and keyframe counts. Call this first when editing a project you have not inspected yet.',
      inputSchema: z.object({ takeId: takeIdSchema }),
      execute: async ({ takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        return {
          success: true,
          project: describeProject(materializeProjectTracks(take)),
        };
      },
    }),

    listEffectCatalog: tool({
      description:
        'List the available clip effects with labels, default intensity, default duration and the parameter schema/defaults for each. Call before addClipEffect when you need exact parameter names.',
      inputSchema: z.object({}),
      execute: async () => ({
        success: true,
        effects: getEffectCatalog(),
      }),
    }),

    listShowcasePresets: tool({
      description:
        'List the built-in showcase presets: complete video recipes with segment order, pacing, slots, effect stacks, aspect ratio and suggested variants. Call this before building a structured showcase from scratch.',
      inputSchema: z.object({}),
      execute: async () => ({
        success: true,
        presets: getShowcasePresets(),
      }),
    }),

    applyShowcasePreset: tool({
      description:
        'Build a complete editable timeline from a showcase preset. This REPLACES the current timeline (media pool and imported assets are kept) and returns the created tracks and clips. Prefer this over hand-building tracks for a standard product demo, mobile preview, tutorial or social cutdown. Omit recordings to reuse the project video assets; otherwise pass assetIds from importRecording, or paths to import. Every slot has a sensible default, so pass only the values the user actually chose.',
      inputSchema: z.object({
        presetId: z
          .string()
          .describe('Preset id from listShowcasePresets'),
        slots: z
          .record(z.string(), z.string())
          .optional()
          .describe('Slot values such as productName, featureOne or cta'),
        recordings: z
          .array(
            z.object({
              assetId: z.string().optional().describe('Media-pool asset id'),
              path: z.string().optional().describe('Video file to import'),
              name: z.string().optional(),
              durationMs: z.number().min(0).optional(),
            }),
          )
          .optional()
          .describe(
            'Recordings in preset order. Each entry needs an assetId or a path.',
          ),
        takeId: takeIdSchema,
      }),
      execute: async ({ presetId, slots, recordings, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = applyShowcasePreset(materializeProjectTracks(take), {
          presetId,
          slots,
          recordings,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return {
          success: true,
          takeId: saved.id,
          applied: result.applied,
        };
      },
    }),

    // ─── Tracks ──────────────────────────────────────────────────────────────

    createTrack: tool({
      description:
        'Create a track (video, audio, effects, transitions, captions or overlays) and return its id. Tracks stack in array order; earlier tracks render above later ones.',
      inputSchema: z.object({
        type: trackTypeSchema.describe('Track type'),
        name: z.string().optional().describe('Optional display name'),
        takeId: takeIdSchema,
      }),
      execute: async ({ type, name, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = createTrack(take, { type, name });
        const saved = commit(result.take);
        return {
          success: true,
          takeId: saved.id,
          track: result.track,
          trackCount: saved.tracks?.length ?? 0,
        };
      },
    }),

    updateTrack: tool({
      description:
        'Rename a track or toggle its locked / visible / muted state.',
      inputSchema: z.object({
        trackId: z.string().describe('Track id'),
        name: z.string().optional(),
        locked: z.boolean().optional(),
        visible: z.boolean().optional(),
        muted: z.boolean().optional(),
        takeId: takeIdSchema,
      }),
      execute: async ({ trackId, name, locked, visible, muted, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = updateTrack(materializeProjectTracks(take), trackId, {
          ...(name !== undefined ? { name } : {}),
          ...(locked !== undefined ? { locked } : {}),
          ...(visible !== undefined ? { visible } : {}),
          ...(muted !== undefined ? { muted } : {}),
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, track: result.track };
      },
    }),

    deleteTrack: tool({
      description:
        'Delete a track and every clip on it. Prefer removeClip when only one element should go.',
      inputSchema: z.object({
        trackId: z.string().describe('Track id'),
        takeId: takeIdSchema,
      }),
      execute: async ({ trackId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = deleteTrack(materializeProjectTracks(take), trackId);
        if (!result.removed) {
          return { success: false, error: `Track ${trackId} not found` };
        }
        const saved = commit(result.take);
        return {
          success: true,
          takeId: saved.id,
          trackCount: saved.tracks?.length ?? 0,
        };
      },
    }),

    reorderTracks: tool({
      description:
        'Reorder tracks to exactly the given id order. The list must contain every existing track id exactly once; the order IS the compositing order.',
      inputSchema: z.object({
        trackIds: z.array(z.string()).describe('All track ids, top row first'),
        takeId: takeIdSchema,
      }),
      execute: async ({ trackIds, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = reorderTracks(
          materializeProjectTracks(take),
          trackIds,
        );
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return {
          success: true,
          takeId: saved.id,
          trackIds: saved.tracks?.map((track) => track.id) ?? [],
        };
      },
    }),

    // ─── Clips ───────────────────────────────────────────────────────────────

    addClipFromAsset: tool({
      description:
        'Place a media-pool asset on the timeline. Creates a video or audio track automatically when needed. Reuse the same asset for multiple placements (intro, callout, replay).',
      inputSchema: z.object({
        assetId: z.string().describe('Media asset id from importRecording'),
        trackId: z.string().optional().describe('Target track (auto-selected)'),
        startMs: z.number().min(0).optional().describe('Timeline start (default 0)'),
        sourceInMs: z
          .number()
          .min(0)
          .optional()
          .describe('Offset into the source asset (default 0)'),
        durationMs: z
          .number()
          .min(1)
          .optional()
          .describe('Placed duration (default: full asset)'),
        takeId: takeIdSchema,
      }),
      execute: async ({ assetId, trackId, startMs, sourceInMs, durationMs, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = addClipFromAsset(materializeProjectTracks(take), {
          assetId,
          trackId,
          startMs,
          sourceInMs,
          durationMs,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, clipId: result.clipId };
      },
    }),

    addClip: tool({
      description:
        'Add a clip with explicit timing. Use for non-media elements (titles, shapes, effect clips) or when you need full control. For media-pool footage prefer addClipFromAsset.',
      inputSchema: z.object({
        trackId: z.string().optional().describe('Target track (auto-selected by kind)'),
        name: z.string().describe('Clip label shown in the timeline'),
        itemType: z
          .enum(['video', 'audio', 'image', 'text', 'effect', 'transition', 'overlay'])
          .optional(),
        startMs: z.number().min(0),
        durationMs: z.number().min(1),
        sourceInMs: z.number().min(0).optional(),
        sourceDurationMs: z.number().min(0).optional(),
        mediaAssetId: z.string().optional(),
        speed: z.number().min(0.1).max(8).optional(),
        volume: z.number().min(0).max(2).optional(),
        opacity: z.number().min(0).max(1).optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
        takeId: takeIdSchema,
      }),
      execute: async ({
        trackId,
        name,
        itemType,
        startMs,
        durationMs,
        sourceInMs,
        sourceDurationMs,
        mediaAssetId,
        speed,
        volume,
        opacity,
        payload,
        takeId,
      }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = addClip(materializeProjectTracks(take), {
          trackId,
          clip: {
            id: '',
            name,
            itemType: itemType as never,
            startMs,
            durationMs,
            sourceInMs: sourceInMs ?? 0,
            ...(sourceDurationMs !== undefined ? { sourceDurationMs } : {}),
            ...(mediaAssetId ? { mediaAssetId } : {}),
            ...(speed !== undefined ? { speed } : {}),
            ...(volume !== undefined ? { volume } : {}),
            ...(opacity !== undefined ? { opacity } : {}),
            payload: payload as never,
          },
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, clip: result.clip };
      },
    }),

    removeClip: tool({
      description: 'Remove one clip from the timeline by id.',
      inputSchema: z.object({
        clipId: z.string(),
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = removeClip(materializeProjectTracks(take), clipId);
        if (!result.removed) {
          return { success: false, error: `Clip ${clipId} not found` };
        }
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, removedClipId: clipId };
      },
    }),

    moveClip: tool({
      description:
        'Move a clip to a new start time and/or another track of the same type.',
      inputSchema: z.object({
        clipId: z.string(),
        startMs: z.number().min(0).optional(),
        trackId: z.string().optional(),
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, startMs, trackId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = moveClip(materializeProjectTracks(take), clipId, {
          startMs,
          trackId,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, clip: result.clip };
      },
    }),

    setClipProperties: tool({
      description:
        'Update a clip transform, speed, volume, opacity, enter/exit animation, or device frame in one call.',
      inputSchema: z.object({
        clipId: z.string(),
        speed: z.number().min(0.1).max(8).optional(),
        volume: z.number().min(0).max(2).optional(),
        opacity: z.number().min(0).max(1).optional(),
        transform: transformSchema,
        deviceFrame: z
          .object({
            type: z.enum([
              'none',
              'browser',
              'macbook',
              'iphone',
              'minimal-svg',
              'glass',
            ]),
            color: z.string().optional(),
            padding: z.number().optional(),
          })
          .optional(),
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, speed, volume, opacity, transform, deviceFrame, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = setClipProperties(materializeProjectTracks(take), clipId, {
          speed,
          volume,
          opacity,
          transform,
          deviceFrame,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, clip: result.clip };
      },
    }),

    // ─── Clip effects ────────────────────────────────────────────────────────

    addClipEffect: tool({
      description:
        `Attach a visual effect to a video or overlay clip (max 5 per clip). Effects render over that clip only and follow its transform. Parameters are static; intensity is keyframable via addEffectKeyframe. Call listEffectCatalog for parameter names.`,
      inputSchema: z.object({
        clipId: z.string(),
        type: effectTypeSchema,
        intensity: z.number().min(0).max(1).optional().describe('Default 0.6'),
        params: effectParamsSchema,
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, type, intensity, params, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = addClipEffect(materializeProjectTracks(take), clipId, {
          type,
          intensity,
          params,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, effect: result.effect };
      },
    }),

    updateClipEffect: tool({
      description:
        'Change a clip effect’s base intensity or merge new static parameters into it.',
      inputSchema: z.object({
        clipId: z.string(),
        effectId: z.string(),
        intensity: z.number().min(0).max(1).optional(),
        params: effectParamsSchema,
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, effectId, intensity, params, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = updateClipEffect(
          materializeProjectTracks(take),
          clipId,
          effectId,
          { intensity, params },
        );
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, effect: result.effect };
      },
    }),

    removeClipEffect: tool({
      description:
        'Remove one effect from a clip. Its intensity keyframes are removed too.',
      inputSchema: z.object({
        clipId: z.string(),
        effectId: z.string(),
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, effectId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = removeClipEffect(
          materializeProjectTracks(take),
          clipId,
          effectId,
        );
        if (!result.removed) {
          return {
            success: false,
            error: `Effect ${effectId} not found on clip ${clipId}`,
          };
        }
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, removedEffectId: effectId };
      },
    }),

    reorderClipEffects: tool({
      description:
        'Set the render order of a clip’s effects. The list must contain every effect id on the clip exactly once, first drawn first.',
      inputSchema: z.object({
        clipId: z.string(),
        effectIds: z.array(z.string()),
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, effectIds, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = reorderClipEffects(
          materializeProjectTracks(take),
          clipId,
          effectIds,
        );
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, effectIds };
      },
    }),

    addEffectKeyframe: tool({
      description:
        'Keyframe an effect’s intensity inside its clip. Times are relative to the clip start (0..clip duration). Use two keyframes for a fade in/out.',
      inputSchema: z.object({
        clipId: z.string(),
        effectId: z.string(),
        timeMs: z.number().min(0).describe('Offset from clip start'),
        intensity: z.number().min(0).max(1),
        easing: easingSchema,
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, effectId, timeMs, intensity, easing, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = addEffectKeyframe(
          materializeProjectTracks(take),
          clipId,
          effectId,
          { timeMs, intensity, easing },
        );
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, keyframe: result.keyframe };
      },
    }),

    removeEffectKeyframe: tool({
      description: 'Remove one keyframe by id.',
      inputSchema: z.object({
        clipId: z.string(),
        keyframeId: z.string(),
        takeId: takeIdSchema,
      }),
      execute: async ({ clipId, keyframeId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = removeEffectKeyframe(
          materializeProjectTracks(take),
          clipId,
          keyframeId,
        );
        if (!result.removed) {
          return { success: false, error: `Keyframe ${keyframeId} not found` };
        }
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, removedKeyframeId: keyframeId };
      },
    }),

    // ─── Captions & overlays ─────────────────────────────────────────────────

    addCaption: tool({
      description:
        'Add a timed caption on the captions lane. Times are composition time (absolute on the timeline), not clip-relative.',
      inputSchema: z.object({
        startMs: z.number().min(0),
        endMs: z.number().min(1),
        text: z.string().min(1),
        takeId: takeIdSchema,
      }),
      execute: async ({ startMs, endMs, text, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = addCaption(materializeProjectTracks(take), {
          startMs,
          endMs,
          text,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, captionId: result.captionId };
      },
    }),

    removeCaption: tool({
      description: 'Remove a caption by clip id.',
      inputSchema: z.object({
        captionId: z.string(),
        takeId: takeIdSchema,
      }),
      execute: async ({ captionId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = removeCaption(
          materializeProjectTracks(take),
          captionId,
        );
        if (!result.removed) {
          return { success: false, error: `Caption ${captionId} not found` };
        }
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, removedCaptionId: captionId };
      },
    }),

    addOverlay: tool({
      description:
        'Add a picture-in-picture image or video overlay. Geometry is normalized to the framed content box: x/y are the centre (0..1), widthPct is width as a fraction of content width.',
      inputSchema: z.object({
        kind: z.enum(['image', 'video']),
        srcPath: z.string().describe('Absolute path to the overlay media'),
        startMs: z.number().min(0),
        endMs: z.number().min(1),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        widthPct: z.number().min(0.05).max(1).optional(),
        opacity: z.number().min(0).max(1).optional(),
        rotation: z.number().optional(),
        cornerRadius: z.number().min(0).optional(),
        takeId: takeIdSchema,
      }),
      execute: async ({
        kind,
        srcPath,
        startMs,
        endMs,
        x,
        y,
        widthPct,
        opacity,
        rotation,
        cornerRadius,
        takeId,
      }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = addOverlay(materializeProjectTracks(take), {
          kind,
          srcPath,
          startMs,
          endMs,
          x,
          y,
          widthPct,
          opacity,
          rotation,
          cornerRadius,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, overlayId: result.overlayId };
      },
    }),

    removeOverlay: tool({
      description: 'Remove a picture-in-picture overlay by id.',
      inputSchema: z.object({
        overlayId: z.string(),
        takeId: takeIdSchema,
      }),
      execute: async ({ overlayId, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = removeOverlay(
          materializeProjectTracks(take),
          overlayId,
        );
        if (!result.removed) {
          return { success: false, error: `Overlay ${overlayId} not found` };
        }
        const saved = commit(result.take);
        return { success: true, takeId: saved.id, removedOverlayId: overlayId };
      },
    }),

    // ─── Recording import ────────────────────────────────────────────────────

    importRecording: tool({
      description:
        'Add a screen recording (or any video file) to the project media pool and return its assetId. Does not place it on the timeline — follow with addClipFromAsset so you control timing and reuse.',
      inputSchema: z.object({
        videoPath: z.string().describe('Absolute path to the video file'),
        title: z.string().optional(),
        durationMs: z.number().min(1).optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        hasAudio: z.boolean().optional(),
        takeId: takeIdSchema,
      }),
      execute: async ({
        videoPath,
        title,
        durationMs,
        width,
        height,
        hasAudio,
        takeId,
      }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = importRecording(materializeProjectTracks(take), {
          videoPath,
          title,
          durationMs,
          width,
          height,
          hasAudio,
        });
        if (result.error) return { success: false, error: result.error };
        const saved = commit(result.take);
        return {
          success: true,
          takeId: saved.id,
          asset: result.asset,
          mediaAssetCount: saved.mediaAssets?.length ?? 0,
        };
      },
    }),

    autoCreateTracks: tool({
      description:
        'Ensure the project has a video lane and optionally an audio lane, returning their ids. Useful after importing a recording with audio.',
      inputSchema: z.object({
        withAudio: z.boolean().optional().describe('Also create an audio lane'),
        takeId: takeIdSchema,
      }),
      execute: async ({ withAudio, takeId }) => {
        const { take, error } = resolve(takeId);
        if (!take) return { success: false, error };
        const result = autoCreateTracks(materializeProjectTracks(take), {
          withAudio,
        });
        const saved = commit(result.take);
        return {
          success: true,
          takeId: saved.id,
          videoTrackId: result.videoTrackId,
          audioTrackId: result.audioTrackId,
        };
      },
    }),
  };
}
