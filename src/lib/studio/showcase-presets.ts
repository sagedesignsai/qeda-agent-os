/**
 * lib/studio/showcase-presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable, end-to-end recipes for showcase videos.
 *
 * A preset owns the decisions that are easy to get wrong and tedious to repeat:
 * segment order and pacing, which recordings fill which beat, the default effect
 * stack, caption styling, framing and the target aspect ratio. Applying one
 * replaces the project's timeline (the media pool is preserved) and returns a
 * normal `StudioTake`, so every later edit goes through the same editing layer
 * as a hand-built project.
 *
 * Presets are validated at module load. A bad built-in is a programming error
 * we want surfaced by tests, not a half-built timeline at runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { z } from 'zod';
import type {
  ClipDeviceFrame,
  StudioAspectRatio,
  StudioCameraEasing,
  StudioCaptionStyle,
  StudioCompositionTransitionType,
  StudioEffectType,
  StudioMediaAsset,
  StudioTake,
} from './types';
import {
  addCaption,
  addClipEffect,
  addClipFromAsset,
  addEffectKeyframe,
  importRecording,
  projectDurationMs,
  setClipProperties,
  setProjectStyling,
} from './editing';

// ── Schema ───────────────────────────────────────────────────────────────────

const effectParamsSchema = z.record(
  z.string(),
  z.union([z.number(), z.string(), z.boolean()]),
);

export const showcasePresetEffectSchema = z.object({
  type: z.enum([
    'spotlight',
    'neon-glow',
    'vignette',
    'film-grain',
    'scanlines',
  ]),
  intensity: z.number().min(0).max(1),
  params: effectParamsSchema.optional(),
  /** Fade the effect up over this many ms from the clip start. */
  fadeInMs: z.number().min(0).max(10_000).optional(),
  /** Fade the effect back down over this many ms before the clip ends. */
  fadeOutMs: z.number().min(0).max(10_000).optional(),
});

const deviceFrameSchema = z.object({
  type: z.enum(['none', 'browser', 'macbook', 'iphone', 'minimal-svg', 'glass']),
  color: z.string().optional(),
  padding: z.number().min(0).max(120).optional(),
});

const animationSchema = z.object({
  type: z.enum([
    'none',
    'fade',
    'slide-left',
    'slide-right',
    'slide-up',
    'slide-down',
    'scale',
    'blur',
  ]),
  durationMs: z.number().min(0).max(5_000),
});

export const showcasePresetSlotSchema = z.object({
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'Slot keys must be alphanumeric camelCase'),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean(),
  defaultValue: z.string().optional(),
  example: z.string().optional(),
});

export const showcasePresetSegmentSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['title', 'recording', 'outro']),
  durationMs: z.number().min(100).max(600_000),
  /** Text shown throughout the segment; supports `{{slot}}` placeholders. */
  text: z.string().max(500).optional(),
  /**
   * Which resolved recording fills this segment. Omit to consume recordings in
   * order. Reusing the same index is how one long recording can be split into
   * several beats with different `sourceOffsetMs`.
   */
  recordingIndex: z.number().int().min(0).max(11).optional(),
  /** Offset into the recording for this segment (ms). */
  sourceOffsetMs: z.number().min(0).optional(),
  /** Per-segment effects; overrides the preset-wide stack. */
  effectStack: z.array(showcasePresetEffectSchema).max(5).optional(),
  deviceFrame: deviceFrameSchema.optional(),
});

export const showcasePresetVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']),
  maxDurationMs: z.number().min(1_000).optional(),
  note: z.string().optional(),
});

export const showcasePresetSchema = z
  .object({
    version: z.literal(1),
    id: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Preset ids are lowercase kebab-case',
      ),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.enum([
      'product',
      'launch',
      'mobile',
      'social',
      'tutorial',
      'brand',
    ]),
    tags: z.array(z.string()).max(12),
    requiredRecordings: z.number().int().min(1).max(12),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']),
    targetDurationMs: z.number().min(1_000).max(3_600_000),
    background: z.string().min(1),
    captionStyle: z.enum(['karaoke', 'minimal', 'badge']),
    cameraEasing: z.enum(['smooth', 'snappy', 'cinematic']),
    padding: z.number().min(0).max(80),
    borderRadius: z.number().min(0).max(64),
    deviceFrame: deviceFrameSchema.optional(),
    enterAnimation: animationSchema.optional(),
    exitAnimation: animationSchema.optional(),
    slots: z.array(showcasePresetSlotSchema).max(12),
    segments: z.array(showcasePresetSegmentSchema).min(1).max(20),
    effectStack: z.array(showcasePresetEffectSchema).max(5),
    variants: z.array(showcasePresetVariantSchema).max(6),
  })
  .superRefine((preset, ctx) => {
    const segmentIds = new Set<string>();
    const slotKeys = new Set(preset.slots.map((slot) => slot.key));

    if (slotKeys.size !== preset.slots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['slots'],
        message: 'Slot keys must be unique.',
      });
    }

    for (const [index, segment] of preset.segments.entries()) {
      if (segmentIds.has(segment.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['segments', index, 'id'],
          message: `Duplicate segment id: ${segment.id}`,
        });
      }
      segmentIds.add(segment.id);

      if (segment.role !== 'recording' && !segment.text?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['segments', index, 'text'],
          message: 'Title and outro segments need text.',
        });
      }
      if (segment.role === 'recording') {
        const recordingIndex = segment.recordingIndex ?? 0;
        if (recordingIndex >= preset.requiredRecordings) {
          ctx.addIssue({
            code: 'custom',
            path: ['segments', index, 'recordingIndex'],
            message: `recordingIndex ${recordingIndex} is outside the ${preset.requiredRecordings} required recordings.`,
          });
        }
      }
    }

    if (!preset.segments.some((segment) => segment.role === 'recording')) {
      ctx.addIssue({
        code: 'custom',
        path: ['segments'],
        message: 'A showcase preset needs at least one recording segment.',
      });
    }

    for (const [index, variant] of preset.variants.entries()) {
      if (preset.variants.findIndex((item) => item.id === variant.id) !== index) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', index, 'id'],
          message: 'Variant ids must be unique.',
        });
      }
    }

    // Every placeholder used in copy must be a declared slot, otherwise apply
    // would silently leave `{{...}}` visible in the finished video.
    const seenPlaceholders: string[] = [];
    for (const segment of preset.segments) {
      for (const match of segment.text?.matchAll(/\{\{(\w+)\}\}/g) ?? []) {
        seenPlaceholders.push(match[1]);
      }
    }
    for (const key of new Set(seenPlaceholders)) {
      if (!slotKeys.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['slots'],
          message: `Copy references the undeclared slot "${key}".`,
        });
      }
    }
  });

export type ShowcasePresetEffect = z.infer<typeof showcasePresetEffectSchema>;
export type ShowcasePresetSlot = z.infer<typeof showcasePresetSlotSchema>;
export type ShowcasePresetSegment = z.infer<
  typeof showcasePresetSegmentSchema
>;
export type ShowcasePresetVariant = z.infer<
  typeof showcasePresetVariantSchema
>;
export type ShowcasePreset = z.infer<typeof showcasePresetSchema>;
export type ShowcasePresetCategory = ShowcasePreset['category'];

export function parseShowcasePreset(value: unknown): ShowcasePreset {
  return showcasePresetSchema.parse(value) as ShowcasePreset;
}

// ── Built-in catalog ─────────────────────────────────────────────────────────

const spotlight = (
  intensity = 0.34,
  radius = 0.34,
): ShowcasePresetEffect => ({
  type: 'spotlight',
  intensity,
  params: { radius },
  fadeInMs: 500,
  fadeOutMs: 500,
});

const vignette = (intensity = 0.18): ShowcasePresetEffect => ({
  type: 'vignette',
  intensity,
});

const slot = (
  key: string,
  label: string,
  defaultValue: string,
  example: string,
  description?: string,
): ShowcasePresetSlot => ({
  key,
  label,
  required: false,
  defaultValue,
  example,
  ...(description ? { description } : {}),
});

const RAW_SHOWCASE_PRESETS: ShowcasePreset[] = [
  {
    version: 1,
    id: 'product-demo-60',
    title: 'Product demo — 60 seconds',
    description:
      'A branded intro, three feature beats and a call to action. The default choice for a self-serve SaaS walkthrough.',
    category: 'product',
    tags: ['saas', 'demo', 'features', '16:9'],
    requiredRecordings: 3,
    aspectRatio: '16:9',
    targetDurationMs: 53_000,
    background:
      'linear-gradient(135deg, #1e1b4b 0%, #0f172a 55%, #020617 100%)',
    captionStyle: 'badge',
    cameraEasing: 'smooth',
    padding: 44,
    borderRadius: 16,
    deviceFrame: { type: 'browser' },
    enterAnimation: { type: 'fade', durationMs: 400 },
    exitAnimation: { type: 'fade', durationMs: 400 },
    slots: [
      slot('productName', 'Product name', 'Our product', 'Acme Cloud'),
      slot(
        'featureOne',
        'First feature',
        'Plan work in one place',
        'Realtime dashboards',
      ),
      slot(
        'featureTwo',
        'Second feature',
        'Automate the busywork',
        'One-click automations',
      ),
      slot(
        'featureThree',
        'Third feature',
        'Ship with confidence',
        'Preview environments',
      ),
      slot('cta', 'Call to action', 'Start your free trial', 'Try it free'),
    ],
    segments: [
      {
        id: 'intro',
        role: 'title',
        durationMs: 5_000,
        text: 'Meet {{productName}}',
      },
      {
        id: 'feature-1',
        role: 'recording',
        durationMs: 14_000,
        text: '{{featureOne}}',
        recordingIndex: 0,
      },
      {
        id: 'feature-2',
        role: 'recording',
        durationMs: 14_000,
        text: '{{featureTwo}}',
        recordingIndex: 1,
      },
      {
        id: 'feature-3',
        role: 'recording',
        durationMs: 14_000,
        text: '{{featureThree}}',
        recordingIndex: 2,
      },
      {
        id: 'outro',
        role: 'outro',
        durationMs: 6_000,
        text: '{{cta}}',
      },
    ],
    effectStack: [spotlight(), vignette()],
    variants: [
      {
        id: 'vertical-cutdown',
        label: '9:16 social cutdown',
        aspectRatio: '9:16',
        maxDurationMs: 30_000,
        note: 'Keep the intro, one feature beat and the CTA.',
      },
      {
        id: 'square-feed',
        label: '1:1 feed cut',
        aspectRatio: '1:1',
        maxDurationMs: 45_000,
      },
    ],
  },
  {
    version: 1,
    id: 'mobile-app-preview',
    title: 'Mobile app preview — vertical',
    description:
      'Two feature beats inside a phone frame, made for App Store previews, Reels and Shorts.',
    category: 'mobile',
    tags: ['mobile', 'app-store', 'vertical', '9:16'],
    requiredRecordings: 2,
    aspectRatio: '9:16',
    targetDurationMs: 27_000,
    background: 'linear-gradient(160deg, #111827 0%, #020617 100%)',
    captionStyle: 'badge',
    cameraEasing: 'snappy',
    padding: 30,
    borderRadius: 22,
    deviceFrame: { type: 'iphone', color: '#111827', padding: 10 },
    enterAnimation: { type: 'slide-up', durationMs: 350 },
    exitAnimation: { type: 'fade', durationMs: 250 },
    slots: [
      slot('appName', 'App name', 'Our app', 'Pulse'),
      slot(
        'featureOne',
        'First feature',
        'Capture ideas instantly',
        'Voice capture',
      ),
      slot(
        'featureTwo',
        'Second feature',
        'Pick up where you left off',
        'Offline sync',
      ),
      slot('cta', 'Call to action', 'Download on the App Store', 'Get the app'),
    ],
    segments: [
      {
        id: 'intro',
        role: 'title',
        durationMs: 3_000,
        text: '{{appName}}',
      },
      {
        id: 'feature-1',
        role: 'recording',
        durationMs: 10_000,
        text: '{{featureOne}}',
        recordingIndex: 0,
      },
      {
        id: 'feature-2',
        role: 'recording',
        durationMs: 10_000,
        text: '{{featureTwo}}',
        recordingIndex: 1,
      },
      {
        id: 'outro',
        role: 'outro',
        durationMs: 4_000,
        text: '{{cta}}',
      },
    ],
    effectStack: [spotlight(0.3, 0.4), vignette(0.22)],
    variants: [
      {
        id: 'app-store',
        label: 'App Store preview',
        aspectRatio: '9:16',
        maxDurationMs: 30_000,
      },
      {
        id: 'landscape-web',
        label: 'Landscape website embed',
        aspectRatio: '16:9',
        maxDurationMs: 20_000,
      },
    ],
  },
  {
    version: 1,
    id: 'tutorial-walkthrough',
    title: 'Tutorial walkthrough',
    description:
      'Split one long recording into two calm, captioned steps with an intro and a next-step outro.',
    category: 'tutorial',
    tags: ['tutorial', 'onboarding', 'single-recording', '16:9'],
    requiredRecordings: 1,
    aspectRatio: '16:9',
    targetDurationMs: 52_000,
    background: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
    captionStyle: 'minimal',
    cameraEasing: 'smooth',
    padding: 52,
    borderRadius: 14,
    enterAnimation: { type: 'fade', durationMs: 300 },
    exitAnimation: { type: 'fade', durationMs: 300 },
    slots: [
      slot('task', 'Task being taught', 'set up your workspace', 'connect a repo'),
      slot(
        'stepOne',
        'First step',
        'Start with the essentials',
        'Create a project',
      ),
      slot(
        'stepTwo',
        'Second step',
        'Then connect your tools',
        'Invite your team',
      ),
      slot('nextStep', 'Next step', 'Explore the advanced settings', 'Set up SSO'),
    ],
    segments: [
      {
        id: 'intro',
        role: 'title',
        durationMs: 3_000,
        text: 'How to {{task}}',
      },
      {
        id: 'step-1',
        role: 'recording',
        durationMs: 22_000,
        text: 'Step 1 — {{stepOne}}',
        recordingIndex: 0,
        sourceOffsetMs: 0,
      },
      {
        id: 'step-2',
        role: 'recording',
        durationMs: 22_000,
        text: 'Step 2 — {{stepTwo}}',
        recordingIndex: 0,
        sourceOffsetMs: 22_000,
      },
      {
        id: 'outro',
        role: 'outro',
        durationMs: 5_000,
        text: 'Next: {{nextStep}}',
      },
    ],
    effectStack: [spotlight(0.24, 0.3)],
    variants: [
      {
        id: 'short-form',
        label: 'Short vertical tutorial',
        aspectRatio: '9:16',
        maxDurationMs: 30_000,
        note: 'Keep one step and the next-step card.',
      },
    ],
  },
  {
    version: 1,
    id: 'social-cutdown',
    title: 'Social cutdown — 30 seconds',
    description:
      'Hook, two fast points and a CTA in 30 seconds, captioned for silent autoplay.',
    category: 'social',
    tags: ['social', 'reels', 'shorts', '9:16', 'captions'],
    requiredRecordings: 1,
    aspectRatio: '9:16',
    targetDurationMs: 30_000,
    background: 'linear-gradient(180deg, #172554 0%, #020617 100%)',
    captionStyle: 'karaoke',
    cameraEasing: 'snappy',
    padding: 24,
    borderRadius: 20,
    enterAnimation: { type: 'scale', durationMs: 250 },
    exitAnimation: { type: 'fade', durationMs: 200 },
    slots: [
      slot('hook', 'Opening hook', 'Stop doing this manually', 'This changed my workflow'),
      slot('pointOne', 'First point', 'One workspace for everything', 'All your tools in one tab'),
      slot('pointTwo', 'Second point', 'Automate the repeatable parts', 'Set it once'),
      slot('cta', 'Call to action', 'Follow for more', 'Try it today'),
    ],
    segments: [
      {
        id: 'hook',
        role: 'title',
        durationMs: 2_000,
        text: '{{hook}}',
      },
      {
        id: 'point-1',
        role: 'recording',
        durationMs: 12_000,
        text: '{{pointOne}}',
        recordingIndex: 0,
        sourceOffsetMs: 0,
      },
      {
        id: 'point-2',
        role: 'recording',
        durationMs: 12_000,
        text: '{{pointTwo}}',
        recordingIndex: 0,
        sourceOffsetMs: 12_000,
      },
      {
        id: 'outro',
        role: 'outro',
        durationMs: 4_000,
        text: '{{cta}}',
      },
    ],
    effectStack: [
      spotlight(0.3, 0.4),
      { type: 'scanlines', intensity: 0.12 },
    ],
    variants: [
      {
        id: 'square',
        label: '1:1 feed version',
        aspectRatio: '1:1',
        maxDurationMs: 30_000,
      },
      {
        id: 'landscape',
        label: '16:9 YouTube version',
        aspectRatio: '16:9',
        maxDurationMs: 45_000,
      },
    ],
  },
];

export const SHOWCASE_PRESETS: ShowcasePreset[] = RAW_SHOWCASE_PRESETS.map(
  (preset) => parseShowcasePreset(preset),
);

const PRESETS_BY_ID = new Map(
  SHOWCASE_PRESETS.map((preset) => [preset.id, preset]),
);

export function getShowcasePreset(id: string): ShowcasePreset | undefined {
  return PRESETS_BY_ID.get(id);
}

// ── List summaries ───────────────────────────────────────────────────────────

export interface ShowcasePresetSummary {
  id: string;
  title: string;
  description: string;
  category: ShowcasePresetCategory;
  tags: string[];
  requiredRecordings: number;
  aspectRatio: StudioAspectRatio;
  targetDurationMs: number;
  slots: ShowcasePresetSlot[];
  segments: Array<{
    id: string;
    role: ShowcasePresetSegment['role'];
    durationMs: number;
    text?: string;
    recordingIndex?: number;
    sourceOffsetMs?: number;
  }>;
  variants: ShowcasePresetVariant[];
}

export function listShowcasePresets(): ShowcasePresetSummary[] {
  return SHOWCASE_PRESETS.map((preset) => ({
    id: preset.id,
    title: preset.title,
    description: preset.description,
    category: preset.category,
    tags: preset.tags,
    requiredRecordings: preset.requiredRecordings,
    aspectRatio: preset.aspectRatio,
    targetDurationMs: preset.targetDurationMs,
    slots: preset.slots,
    segments: preset.segments.map((segment) => ({
      id: segment.id,
      role: segment.role,
      durationMs: segment.durationMs,
      ...(segment.text !== undefined ? { text: segment.text } : {}),
      ...(segment.recordingIndex !== undefined
        ? { recordingIndex: segment.recordingIndex }
        : {}),
      ...(segment.sourceOffsetMs !== undefined
        ? { sourceOffsetMs: segment.sourceOffsetMs }
        : {}),
    })),
    variants: preset.variants,
  }));
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface ShowcasePresetRecordingInput {
  /** Existing media-pool asset. Takes precedence over `path`. */
  assetId?: string;
  /** Video file to add to the media pool. */
  path?: string;
  name?: string;
  /** Known source duration when the asset has none yet. */
  durationMs?: number;
}

export interface ApplyShowcasePresetInput {
  presetId: string;
  slots?: Record<string, string>;
  /**
   * Recordings that fill the preset's recording slots, in order. Omit to reuse
   * the project's existing video assets; a single legacy recording becomes the
   * first source automatically.
   */
  recordings?: ShowcasePresetRecordingInput[];
}

export interface AppliedShowcasePreset {
  presetId: string;
  title: string;
  durationMs: number;
  aspectRatio: StudioAspectRatio;
  trackIds: string[];
  videoClipIds: string[];
  captionClipIds: string[];
  recordings: Array<{ assetId: string; name: string; durationMs: number }>;
  slots: Record<string, string>;
  variants: ShowcasePresetVariant[];
  warnings: string[];
}

export interface ApplyShowcasePresetResult {
  take: StudioTake;
  applied?: AppliedShowcasePreset;
  error?: string;
}

interface ResolvedRecording {
  asset: StudioMediaAsset;
  durationMs: number;
}

export function applyShowcasePreset(
  take: StudioTake,
  input: ApplyShowcasePresetInput,
): ApplyShowcasePresetResult {
  const preset = getShowcasePreset(input.presetId);
  if (!preset) {
    return {
      take,
      error: `Unknown showcase preset: ${input.presetId}. Call listShowcasePresets for the available ids.`,
    };
  }

  const resolvedSlots = resolvePresetSlots(preset, input.slots);
  if (resolvedSlots.error) return { take, error: resolvedSlots.error };

  const source = resolvePresetRecordings(take, preset, input.recordings);
  if (source.error) return { take, error: source.error };

  const warnings = [...source.warnings];

  // A preset describes a whole timeline. Replace the timeline but keep the
  // media pool (including any assets the caller just imported) so sources stay
  // reusable in later edits.
  const videoTrackId = `track-video-${nanoid(6)}`;
  let next: StudioTake = {
    ...source.take,
    durationMs: 0,
    tracks: [
      {
        id: videoTrackId,
        name: 'Video 1',
        type: 'video',
        locked: false,
        visible: true,
        clips: [],
      },
    ],
    // Clear the legacy projection: those elements belonged to the old timeline
    // and would otherwise reappear alongside the preset's clips on reload.
    cuts: [],
    zooms: [],
    captions: [],
    effects: [],
    overlays: [],
  };

  const videoClipIds: string[] = [];
  const captionClipIds: string[] = [];
  let cursorMs = 0;
  let nextRecording = 0;
  let totalMs = 0;

  for (const segment of preset.segments) {
    if (segment.role === 'recording') {
      const recordingIndex = segment.recordingIndex ?? nextRecording++;
      const recording = source.recordings[recordingIndex];
      if (!recording) {
        return {
          take,
          error: `Preset ${preset.id} needs recording ${recordingIndex + 1}.`,
        };
      }

      const sourceInMs = segment.sourceOffsetMs ?? 0;
      const availableMs =
        recording.durationMs > 0
          ? recording.durationMs - sourceInMs
          : segment.durationMs;
      if (recording.durationMs > 0 && availableMs <= 0) {
        return {
          take,
          error: `Recording "${recording.asset.name}" is shorter than the preset's ${sourceInMs}ms source offset.`,
        };
      }
      const clipDurationMs = Math.max(
        1,
        recording.durationMs > 0
          ? Math.min(segment.durationMs, availableMs)
          : segment.durationMs,
      );
      if (clipDurationMs < segment.durationMs) {
        warnings.push(
          `Recording "${recording.asset.name}" is shorter than its ${segment.durationMs}ms beat; the clip was trimmed to ${clipDurationMs}ms.`,
        );
      }

      const placed = addClipFromAsset(next, {
        assetId: recording.asset.id,
        trackId: videoTrackId,
        startMs: cursorMs,
        sourceInMs,
        durationMs: clipDurationMs,
      });
      if (placed.error || !placed.clipId) {
        return { take, error: placed.error ?? 'Could not place the recording.' };
      }
      next = placed.take;
      const clipId = placed.clipId;
      videoClipIds.push(clipId);

      if (preset.enterAnimation || preset.exitAnimation) {
        const styled = setClipProperties(next, clipId, {
          ...(preset.enterAnimation
            ? {
                enterAnimation: clipAnimation(
                  preset.enterAnimation,
                  clipDurationMs,
                ),
              }
            : {}),
          ...(preset.exitAnimation
            ? {
                exitAnimation: clipAnimation(
                  preset.exitAnimation,
                  clipDurationMs,
                ),
              }
            : {}),
        });
        if (styled.error) return { take, error: styled.error };
        next = styled.take;
      }

      const frame = segment.deviceFrame ?? preset.deviceFrame;
      if (frame && frame.type !== 'none') {
        const framed = setClipProperties(next, clipId, {
          deviceFrame: frame as ClipDeviceFrame,
        });
        if (framed.error) return { take, error: framed.error };
        next = framed.take;
      }

      const effects = segment.effectStack ?? preset.effectStack;
      for (const effect of effects) {
        const added = addClipEffect(next, clipId, {
          type: effect.type as StudioEffectType,
          intensity: effect.intensity,
          ...(effect.params ? { params: effect.params } : {}),
        });
        if (added.error || !added.effect) {
          return { take, error: added.error ?? 'Could not add a preset effect.' };
        }
        next = added.take;
        next = addEffectFade(
          next,
          clipId,
          added.effect.id,
          clipDurationMs,
          effect,
        );
      }

      if (segment.text?.trim()) {
        const captioned = addCaption(next, {
          startMs: cursorMs,
          endMs: cursorMs + clipDurationMs,
          text: fillTemplate(segment.text, resolvedSlots.values),
        });
        if (captioned.error) return { take, error: captioned.error };
        next = captioned.take;
        if (captioned.captionId) captionClipIds.push(captioned.captionId);
      }

      cursorMs += clipDurationMs;
      totalMs = cursorMs;
      continue;
    }

    if (!segment.text?.trim()) {
      return {
        take,
        error: `Preset segment ${segment.id} has no text.`,
      };
    }
    const captioned = addCaption(next, {
      startMs: cursorMs,
      endMs: cursorMs + segment.durationMs,
      text: fillTemplate(segment.text, resolvedSlots.values),
    });
    if (captioned.error) return { take, error: captioned.error };
    next = captioned.take;
    if (captioned.captionId) captionClipIds.push(captioned.captionId);
    cursorMs += segment.durationMs;
    totalMs = cursorMs;
  }

  const styled = setProjectStyling(next, {
    aspectRatio: preset.aspectRatio,
    background: preset.background,
    cameraEasing: preset.cameraEasing as StudioCameraEasing,
    captionStyle: preset.captionStyle as StudioCaptionStyle,
    canvasMode: 'showcase',
    showCaptions: true,
    padding: preset.padding,
    borderRadius: preset.borderRadius,
  });
  if (styled.error) return { take, error: styled.error };
  next = {
    ...styled.take,
    durationMs: Math.max(projectDurationMs(styled.take), totalMs),
  };

  return {
    take: next,
    applied: {
      presetId: preset.id,
      title: preset.title,
      durationMs: next.durationMs,
      aspectRatio: preset.aspectRatio,
      trackIds: next.tracks?.map((track) => track.id) ?? [],
      videoClipIds,
      captionClipIds,
      recordings: source.recordings.map((recording) => ({
        assetId: recording.asset.id,
        name: recording.asset.name,
        durationMs: recording.durationMs,
      })),
      slots: resolvedSlots.values,
      variants: preset.variants,
      warnings,
    },
  };
}

function clipAnimation(
  animation: { type: string; durationMs: number },
  clipDurationMs: number,
) {
  return {
    type: animation.type as StudioCompositionTransitionType,
    durationMs: Math.min(
      animation.durationMs,
      Math.max(0, Math.floor(clipDurationMs / 2)),
    ),
    easing: 'ease-out',
  };
}

function addEffectFade(
  take: StudioTake,
  clipId: string,
  effectId: string,
  clipDurationMs: number,
  effect: ShowcasePresetEffect,
): StudioTake {
  const fadeInMs = Math.min(effect.fadeInMs ?? 0, clipDurationMs / 2);
  const fadeOutMs = Math.min(effect.fadeOutMs ?? 0, clipDurationMs / 2);
  let next = take;
  let lastTime = -1;

  const add = (timeMs: number, intensity: number, easing: string) => {
    const clamped = Math.max(0, Math.min(clipDurationMs, Math.round(timeMs)));
    if (clamped === lastTime) return;
    lastTime = clamped;
    const added = addEffectKeyframe(next, clipId, effectId, {
      timeMs: clamped,
      intensity,
      easing,
    });
    if (!added.error) next = added.take;
  };

  if (fadeInMs > 0) {
    add(0, 0, 'ease-out');
    add(fadeInMs, effect.intensity, 'ease-out');
  }
  if (fadeOutMs > 0) {
    if (fadeInMs <= 0) add(0, effect.intensity, 'ease-in');
    add(clipDurationMs - fadeOutMs, effect.intensity, 'ease-in');
    add(clipDurationMs, 0, 'ease-in');
  }

  return next;
}

function resolvePresetSlots(
  preset: ShowcasePreset,
  overrides: Record<string, string> | undefined,
): { values: Record<string, string>; error?: string } {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const slot of preset.slots) {
    const provided = overrides?.[slot.key]?.trim();
    if (provided) {
      values[slot.key] = provided;
    } else if (slot.defaultValue !== undefined) {
      values[slot.key] = slot.defaultValue;
    } else if (slot.required) {
      missing.push(slot.key);
    }
  }

  // A placeholder with no value would render literally, so treat it as missing
  // even for slots marked optional.
  for (const segment of preset.segments) {
    for (const match of segment.text?.matchAll(/\{\{(\w+)\}\}/g) ?? []) {
      if (!values[match[1]] && !missing.includes(match[1])) {
        missing.push(match[1]);
      }
    }
  }

  if (missing.length > 0) {
    return {
      values,
      error: `Missing showcase preset slot value${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    };
  }
  return { values };
}

function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

function resolvePresetRecordings(
  take: StudioTake,
  preset: ShowcasePreset,
  requested: ShowcasePresetRecordingInput[] | undefined,
): {
  take: StudioTake;
  recordings: ResolvedRecording[];
  warnings: string[];
  error?: string;
} {
  let next = take;
  const warnings: string[] = [];
  const recordings: ResolvedRecording[] = [];

  const findByAssetId = (assetId: string) =>
    (next.mediaAssets ?? []).find((asset) => asset.id === assetId);
  const findByPath = (path: string) =>
    (next.mediaAssets ?? []).find((asset) => asset.path === path);

  if (requested && requested.length > 0) {
    for (const [index, item] of requested.entries()) {
      let asset: StudioMediaAsset | undefined;
      if (item.assetId) {
        asset = findByAssetId(item.assetId);
        if (!asset) {
          return {
            take,
            recordings: [],
            warnings,
            error: `Recording ${index + 1}: media asset ${item.assetId} not found.`,
          };
        }
      } else if (item.path) {
        asset = findByPath(item.path);
        if (!asset) {
          const imported = importRecording(next, {
            videoPath: item.path,
            title: item.name,
            ...(item.durationMs !== undefined
              ? { durationMs: item.durationMs }
              : {}),
          });
          if (imported.error || !imported.asset) {
            return {
              take,
              recordings: [],
              warnings,
              error: imported.error ?? `Could not import ${item.path}.`,
            };
          }
          next = imported.take;
          asset = imported.asset;
        }
      } else {
        return {
          take,
          recordings: [],
          warnings,
          error: `Recording ${index + 1} needs an assetId or a path.`,
        };
      }

      // A probed asset duration is authoritative; the caller's value is only a
      // fallback for sources that have not been probed yet.
      const durationMs =
        asset.durationMs > 0
          ? asset.durationMs
          : Math.max(0, item.durationMs ?? 0);
      recordings.push({ asset, durationMs });
    }
  } else {
    for (const asset of (next.mediaAssets ?? []).filter(
      (candidate) => candidate.kind === 'video',
    )) {
      recordings.push({ asset, durationMs: asset.durationMs });
    }

    if (recordings.length === 0 && next.videoPath) {
      const imported = importRecording(next, {
        videoPath: next.videoPath,
        title: next.title,
        durationMs: next.durationMs,
      });
      if (!imported.error && imported.asset) {
        next = imported.take;
        recordings.push({
          asset: imported.asset,
          durationMs: imported.asset.durationMs,
        });
      }
    }
  }

  if (recordings.length < preset.requiredRecordings) {
    return {
      take,
      recordings: [],
      warnings,
      error: `Preset ${preset.id} needs ${preset.requiredRecordings} recording${preset.requiredRecordings === 1 ? '' : 's'}, but ${recordings.length} ${recordings.length === 1 ? 'was' : 'were'} available. Import recordings with importRecording first, or pass their paths to applyShowcasePreset.`,
    };
  }
  if (recordings.length > preset.requiredRecordings) {
    warnings.push(
      `Using the first ${preset.requiredRecordings} of ${recordings.length} available recordings.`,
    );
  }

  return {
    take: next,
    recordings: recordings.slice(0, preset.requiredRecordings),
    warnings,
  };
}
