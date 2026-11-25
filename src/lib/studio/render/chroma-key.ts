/**
 * lib/studio/render/chroma-key.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolution of a clip's `chroma-key` effect into render-ready parameters.
 *
 * Keying is a *source* filter: it has to run on the clip's own pixels before the
 * clip is composited, otherwise the background it should reveal has already been
 * overwritten. Both render paths (the display-list rasterizer and the legacy
 * fused compositor) therefore resolve the effect here and hand the result to the
 * source pass, rather than emitting it as an adjustment-layer effect op.
 *
 * Defaults come from the parameter schema, so an effect added before the UI
 * exposed its parameters still keys with the catalog's green-screen defaults.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ClipEffect } from '../types';
import { normalizeEffectParams } from '../effects/params';
import type { ChromaKeyParams } from './display-list';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** The clip's key effect, if it has one. Stack order is irrelevant — a key is
 *  a source property, so multiple keys would be ambiguous; the first wins. */
export function findChromaKeyEffect(
  effects: readonly ClipEffect[] | undefined,
): ClipEffect | undefined {
  return effects?.find((effect) => effect.type === 'chroma-key');
}

/**
 * Resolve schema defaults + user params + keyframed intensity into the shape the
 * GPU source pass consumes.
 */
export function resolveChromaKeyParams(
  effect: Pick<ClipEffect, 'params'>,
  intensity: number,
): ChromaKeyParams {
  const params = normalizeEffectParams('chroma-key', effect.params);
  const number = (key: string, fallback: number): number => {
    const value = params[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const keyColor =
    typeof params.keyColor === 'string' && params.keyColor.length > 0
      ? params.keyColor
      : '#00ff00';

  return {
    keyColor,
    tolerance: clamp01(number('tolerance', 0.28)),
    softness: clamp01(number('softness', 0.12)),
    spill: clamp01(number('spill', 0.6)),
    intensity: clamp01(intensity),
  };
}
