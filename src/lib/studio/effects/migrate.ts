/**
 * lib/studio/effects/migrate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Legacy (timed, take-level) effects → timeline effect clips.
 *
 * HISTORICAL CONTEXT
 * ──────────────────
 * The effects redesign introduced clip-attached effects (`clip.payload.effects`).
 * An earlier version of this module *destructively* migrated `take.effects` onto
 * clips during conversion, then cleared the field and set `effectsMigratedAt`.
 * That approach had two fatal problems:
 *
 *   1. A legacy take has no `tracks`, so there was no clip to attach to. The
 *      migration warned, cleared `take.effects`, and the recording silently lost
 *      every effect on the next load.
 *   2. `effectsMigratedAt` was never persisted (no DB column), so the migration
 *      re-ran on every load and could duplicate effects.
 *
 * THE CURRENT MODEL
 * ─────────────────
 * The conversion is now **non-destructive and idempotent by construction**:
 *
 *   - `take.tracks === undefined` (a legacy single-recording take):
 *     `take.effects` is authoritative and is projected as timed effect clips on
 *     the effects lane, alongside kinetic zooms. Nothing is mutated, so there is
 *     no marker to persist and no way to lose or duplicate an effect.
 *
 *   - `take.tracks !== undefined` (a multi-track project):
 *     clip-attached effects are authoritative. `take.effects` is ignored, which
 *     is what prevents an effect clip on the effects lane from rendering twice.
 *
 * Round-tripping still works because `extractEffectsFromTracks` maps effect-lane
 * clips back to `StudioEffect[]` when the timeline is committed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  StudioTake,
  StudioEffect,
  TimelineClip,
  StudioEffectType,
} from '../types';
import { isStudioEffectType } from './catalog';
import {
  compRangeFromSource,
  type RippleCut,
} from '../timeline/ripple';

/** Timeline lane that holds zooms and legacy timed canvas effects. */
const EFFECTS_TRACK_ID = 'track-effects';

export interface LegacyEffectProjection {
  clips: TimelineClip[];
  warnings: string[];
}

/**
 * Project `take.effects` into effect clips on the effects lane.
 *
 * The returned clip ids are the original effect ids, so the reverse conversion
 * (`extractEffectsFromTracks`) is lossless and re-saving a take cannot create
 * duplicate effects.
 *
 * Returns an empty list when the take is a multi-track project, because its
 * clip-attached effects already own rendering.
 */
export function buildLegacyEffectClips(
  take: StudioTake,
  cuts: readonly RippleCut[] = [],
): TimelineClip[] {
  return projectLegacyEffects(take, cuts).clips;
}

/** Same as {@link buildLegacyEffectClips} but surfaces validation warnings. */
export function projectLegacyEffects(
  take: StudioTake,
  cuts: readonly RippleCut[] = [],
): LegacyEffectProjection {
  const result: LegacyEffectProjection = { clips: [], warnings: [] };

  // Multi-track projects render clip-attached effects; the legacy field is a
  // read-only artifact and must not paint a second time.
  if (take.tracks !== undefined) return result;

  const effects = take.effects ?? [];
  if (effects.length === 0) return result;

  for (const effect of effects) {
    if (!isStudioEffectType(effect.type)) {
      result.warnings.push(
        `Skipped effect ${effect.id}: invalid type '${effect.type}'`,
      );
      continue;
    }

    const span = compRangeFromSource(
      { startMs: effect.startMs, endMs: effect.endMs },
      cuts,
    );
    if (!span || span.endMs <= span.startMs) {
      result.warnings.push(
        `Effect ${effect.id} (${effect.type}) is fully cut; skipped`,
      );
      continue;
    }

    result.clips.push(effectToClip(effect, span.startMs, span.endMs));
  }

  return result;
}

function effectToClip(
  effect: StudioEffect,
  startMs: number,
  endMs: number,
): TimelineClip {
  return {
    id: effect.id,
    trackId: EFFECTS_TRACK_ID,
    itemType: 'effect',
    name: effectLabel(effect.type),
    startMs,
    durationMs: endMs - startMs,
    sourceStartMs: effect.startMs,
    sourceDurationMs: Math.max(0, effect.endMs - effect.startMs),
    color: '#0ea5e9',
    payload: {
      effectType: effect.type,
      intensity: effect.intensity,
    },
  };
}

function effectLabel(type: StudioEffectType): string {
  switch (type) {
    case 'spotlight':
      return 'Spotlight';
    case 'neon-glow':
      return 'Neon Glow';
    case 'vignette':
      return 'Vignette';
    case 'film-grain':
      return 'Film Grain';
    case 'scanlines':
      return 'Scanlines';
  }
}

/**
 * Legacy compatibility shim.
 *
 * Migration is no longer a mutation step — effects are projected on read. This
 * remains because older call sites imported it, and it now reports "nothing to
 * do" instead of rewriting a take.
 */
export function migrateEffectsToClips(take: StudioTake): {
  success: boolean;
  migratedEffectCount: number;
  assignedToClips: Map<string, number>;
  warnings: string[];
} {
  return {
    success: true,
    migratedEffectCount: 0,
    assignedToClips: new Map(),
    warnings: take.tracks === undefined
      ? []
      : [
          'Effects are clip-attached on this multi-track project; take.effects is ignored.',
        ],
  };
}

/** True when the take no longer relies on the legacy timed-effect field. */
export function isEffectsMigrated(take: StudioTake): boolean {
  return take.tracks !== undefined || (take.effects ?? []).length === 0;
}

/**
 * Diagnostics for a take: confirm no effect is rendered twice and that every
 * clip-attached effect is well-formed.
 */
export function validateMigration(take: StudioTake): {
  valid: boolean;
  orphanedEffects: number;
  clipsWithEffects: number;
  errors: string[];
} {
  const errors: string[] = [];
  let clipsWithEffects = 0;

  for (const track of take.tracks ?? []) {
    for (const clip of track.clips) {
      const effects = clip.payload?.effects ?? [];
      clipsWithEffects += effects.length;
      const seen = new Set<string>();
      for (const effect of effects) {
        if (seen.has(effect.id)) {
          errors.push(`Clip ${clip.id} has duplicate effect id ${effect.id}`);
        }
        seen.add(effect.id);
        if (!isStudioEffectType(effect.type)) {
          errors.push(`Clip ${clip.id} has invalid effect type ${effect.type}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    orphanedEffects:
      take.tracks === undefined ? 0 : (take.effects ?? []).length,
    clipsWithEffects,
    errors,
  };
}
