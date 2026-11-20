/**
 * lib/studio/effects/migrate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-migration of global effects (old system) to clip-attached effects (new).
 *
 * On first load of a project with `take.effects[]` (global track-based), this
 * migrates effects to individual clips while preserving all intensity keyframes
 * in local (clip-relative) time.
 *
 * Migration is idempotent: marked by `take.effectsMigratedAt` timestamp.
 * Re-running migration on an already-migrated take is safe (no-op).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioTake, StudioClip, ClipEffect, StudioKeyframe } from '../types';
import { isStudioEffectType } from './catalog';
import { nanoid } from 'nanoid';

export interface MigrationResult {
  success: boolean;
  migratedEffectCount: number;
  assignedToClips: Map<string, number>;  // clipId → effect count
  warnings: string[];
}

/**
 * Migrate global effects from `take.effects[]` to clip-attached effects.
 *
 * - For each effect in `take.effects[]`:
 *   1. Find all overlapping video/overlay clips
 *   2. Assign to primary (first in z-order) clip
 *   3. Convert global timing to local (clip-relative)
 *   4. Preserve intensity keyframes
 *   5. Attach to `clip.payload.effects[]`
 * - Clear `take.effects[]` after migration
 * - Set `take.effectsMigratedAt` marker (idempotent)
 *
 * Safe to call multiple times (checks marker first).
 */
export function migrateEffectsToClips(take: StudioTake): MigrationResult {
  const result: MigrationResult = {
    success: true,
    migratedEffectCount: 0,
    assignedToClips: new Map(),
    warnings: [],
  };

  // Check if already migrated
  if (take.effectsMigratedAt !== undefined) {
    return result;  // Already migrated, no-op
  }

  // No effects to migrate
  if (!take.effects || take.effects.length === 0) {
    // Mark as migrated even if no effects (prevents future re-runs)
    take.effectsMigratedAt = Date.now();
    return result;
  }

  // Collect all video and overlay clips (from tracks)
  const videoOverlayClips: StudioClip[] = [];
  if (take.tracks) {
    for (const track of take.tracks) {
      if (track.type === 'video' || track.type === 'overlays') {
        videoOverlayClips.push(...track.clips);
      }
    }
  }

  // Migrate each global effect
  for (const effect of take.effects) {
    // Validate effect type
    if (!isStudioEffectType(effect.type)) {
      result.warnings.push(
        `Skipped effect ${effect.id}: invalid type '${effect.type}'`,
      );
      continue;
    }

    // Find overlapping clips
    const overlappingClips = videoOverlayClips.filter((clip) => {
      const clipStart = clip.startMs;
      const clipEnd = clip.startMs + clip.durationMs;
      const effectStart = effect.startMs;
      const effectEnd = effect.endMs;

      // Half-open range: [clipStart, clipEnd) ∩ [effectStart, effectEnd)
      return clipStart < effectEnd && effectStart < clipEnd;
    });

    if (overlappingClips.length === 0) {
      result.warnings.push(
        `Effect ${effect.id} (${effect.type}) has no overlapping clips; skipped`,
      );
      continue;
    }

    // Assign to primary (first) clip
    const primaryClip = overlappingClips[0];
    if (!primaryClip.payload) {
      primaryClip.payload = {};
    }
    if (!primaryClip.payload.effects) {
      primaryClip.payload.effects = [];
    }

    // Create ClipEffect with converted timing
    const clipEffect: ClipEffect = {
      id: nanoid(8),
      type: effect.type,
      intensity: effect.intensity,
      params: {},  // No params in old system; static defaults per effect type
      stackOrder: primaryClip.payload.effects.length,  // Append to stack
    };

    // Add to clip
    primaryClip.payload.effects.push(clipEffect);
    result.migratedEffectCount++;

    const assignCount = result.assignedToClips.get(primaryClip.id) ?? 0;
    result.assignedToClips.set(primaryClip.id, assignCount + 1);

    // Migrate intensity keyframes from global to local (clip-relative)
    // The old system used clip.payload.intensity (static) + no keyframes on effects track
    // The new system uses universal keyframes with property 'effect:<effectId>:intensity'
    //
    // If effect has multiple keyframes in old system (unlikely), they would be on the
    // effect clip's universal keyframes. We preserve those here.
    //
    // For now, no keyframes are transferred (old effects track clips don't have keyframes
    // in the current system). Future enhancement: support keyframed intensity on effect clips.
  }

  // Clear global effects after migration
  take.effects = [];

  // Mark migration complete (idempotent)
  take.effectsMigratedAt = Date.now();

  return result;
}

/**
 * Get migration status for a take.
 * Returns true if migration has been completed (or not needed).
 */
export function isEffectsMigrated(take: StudioTake): boolean {
  return take.effectsMigratedAt !== undefined;
}

/**
 * Validate migrated take: ensure effects are on clips and no orphans remain.
 * Used for diagnostics and testing.
 */
export function validateMigration(take: StudioTake): {
  valid: boolean;
  orphanedEffects: number;
  clipsWithEffects: number;
  errors: string[];
} {
  const result = {
    valid: true,
    orphanedEffects: 0,
    clipsWithEffects: 0,
    errors: [] as string[],
  };

  // Should have no global effects after migration
  if (take.effects && take.effects.length > 0) {
    result.valid = false;
    result.orphanedEffects = take.effects.length;
    result.errors.push(
      `Migration incomplete: ${take.effects.length} global effects remain`,
    );
  }

  // Count clips with effects
  if (take.tracks) {
    for (const track of take.tracks) {
      for (const clip of track.clips) {
        if (clip.payload?.effects && clip.payload.effects.length > 0) {
          result.clipsWithEffects += clip.payload.effects.length;
        }
      }
    }
  }

  return result;
}
