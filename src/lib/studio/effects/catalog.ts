/**
 * lib/studio/effects/catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Studio canvas-effect catalog and the pure resolvers over it.
 *
 * An "effect" is a timed compositing pass over the framed video (see
 * `../render/effects.ts`). It is deliberately distinct from a *zoom*, which is a
 * camera transform over the same frame — conflating the two is what previously
 * made every non-zoom effect collapse into a 1.5× centre punch-in.
 *
 * This module is pure data + pure functions: no canvas, no React. The UI builds
 * its preset grid from `STUDIO_EFFECTS`, and the timeline/convert layer uses the
 * same definitions to round-trip clips.
 *
 * Three of the entries (`color-grade`, `chroma-key`, `motion-blur`) are executed
 * by the WebGL 2 pass in `../render/gl-effect-pass.ts`; the rest are Canvas 2D
 * primitives. The catalog does not distinguish them — resolution happens at
 * render time, with a Canvas 2D fallback per effect.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioEffect, StudioEffectType } from '../types';

export type StudioEffectCategory =
  | 'Light'
  | 'Film'
  | 'Retro'
  | 'Color'
  | 'Keying'
  | 'Motion';

export interface StudioEffectDefinition {
  type: StudioEffectType;
  label: string;
  category: StudioEffectCategory;
  description: string;
  /** Sensible starting strength (0..1). */
  defaultIntensity: number;
  /** Default on-timeline length in ms. */
  defaultDurationMs: number;
  /** Accent colour used by the content card preview. */
  accent: string;
}

export const STUDIO_EFFECTS: StudioEffectDefinition[] = [
  {
    type: 'spotlight',
    label: 'Spotlight Focus',
    category: 'Light',
    description: 'Vignetted spotlight that pools light on the frame centre.',
    defaultIntensity: 0.6,
    defaultDurationMs: 3000,
    accent: '#d97706',
  },
  {
    type: 'neon-glow',
    label: 'Ambient Neon Glow',
    category: 'Light',
    description: 'Additive indigo bloom around the window edge.',
    defaultIntensity: 0.7,
    defaultDurationMs: 4000,
    accent: '#6366f1',
  },
  {
    type: 'vignette',
    label: 'Cinematic Vignette',
    category: 'Film',
    description: 'Soft darkening toward the corners for a filmic frame.',
    defaultIntensity: 0.55,
    defaultDurationMs: 4000,
    accent: '#475569',
  },
  {
    type: 'film-grain',
    label: 'Film Grain',
    category: 'Film',
    description: 'Animated luma noise dusted over the frame.',
    defaultIntensity: 0.35,
    defaultDurationMs: 6000,
    accent: '#a8a29e',
  },
  {
    type: 'scanlines',
    label: 'CRT Scanlines',
    category: 'Retro',
    description: 'Horizontal interlace lines with a faint roll.',
    defaultIntensity: 0.4,
    defaultDurationMs: 5000,
    accent: '#22d3ee',
  },
  // ── GPU passes (WebGL 2, see `render/gl-effect-pass.ts`) ────────────────────
  {
    type: 'color-grade',
    label: 'Cinematic Grade',
    category: 'Color',
    description:
      'GPU colour grade: exposure, contrast, saturation and white balance.',
    defaultIntensity: 0.8,
    defaultDurationMs: 6000,
    accent: '#0ea5e9',
  },
  {
    type: 'chroma-key',
    label: 'Chroma Key',
    category: 'Keying',
    description:
      'Removes a solid background colour (green/blue screen) with spill suppression.',
    defaultIntensity: 1,
    defaultDurationMs: 8000,
    accent: '#22c55e',
  },
  {
    type: 'motion-blur',
    label: 'Motion Blur',
    category: 'Motion',
    description: 'Directional smear across the frame for speed and whip-pans.',
    defaultIntensity: 0.6,
    defaultDurationMs: 3000,
    accent: '#f97316',
  },
];

const EFFECT_BY_TYPE = new Map(
  STUDIO_EFFECTS.map((definition) => [definition.type, definition]),
);

export function getStudioEffectDefinition(
  type: StudioEffectType,
): StudioEffectDefinition | undefined {
  return EFFECT_BY_TYPE.get(type);
}

export function isStudioEffectType(value: unknown): value is StudioEffectType {
  return typeof value === 'string' && EFFECT_BY_TYPE.has(value as StudioEffectType);
}

/** True while `timeMs` falls inside the effect's (inclusive) time span. */
export function isStudioEffectActive(
  effect: Pick<StudioEffect, 'startMs' | 'endMs'>,
  timeMs: number,
): boolean {
  return timeMs >= effect.startMs && timeMs <= effect.endMs;
}

/** Every effect covering the playhead, in timeline order. */
export function resolveActiveStudioEffects(
  effects: readonly StudioEffect[] | undefined,
  timeMs: number,
): StudioEffect[] {
  if (!effects || effects.length === 0) return [];
  return effects
    .filter((effect) => isStudioEffectActive(effect, timeMs))
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Narrows an arbitrary clip payload to a canvas effect. Mirrors how zoom clips
 * are detected: anything without a recognized `effectType` is *not* an effect.
 */
export function effectTypeFromPayload(
  payload: { effectType?: string } | undefined,
): StudioEffectType | null {
  const type = payload?.effectType;
  return isStudioEffectType(type) ? type : null;
}
