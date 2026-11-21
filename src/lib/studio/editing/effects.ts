/**
 * lib/studio/editing/effects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Clip-attached effect operations, keyframes, and the effect catalog.
 *
 * Effects are stored on `clip.payload.effects` and render in ascending
 * `stackOrder` immediately after the clip. Intensity is keyframable through the
 * universal keyframe system using the property `effect:<effectId>:intensity`
 * (see `keyframes.effectIntensityProperty`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type {
  ClipEffect,
  StudioAnimationEasing,
  StudioKeyframe,
  StudioTake,
  StudioEffectType,
} from '../types';
import {
  STUDIO_EFFECTS,
  isStudioEffectType,
  type StudioEffectDefinition,
} from '../effects/catalog';
import {
  getDefaultParams,
  getEffectParamSchema,
  normalizeEffectParams,
  validateEffectParams,
  type EffectParamSchema,
} from '../effects/params';
import { effectIntensityProperty } from '../keyframes';
import { findClip } from './clips';

export const MAX_EFFECTS_PER_CLIP = 5;

export interface CatalogEntry extends StudioEffectDefinition {
  params: EffectParamSchema['params'];
  defaults: Record<string, number | string | boolean>;
}

/** The agent-facing effect catalog: labels, defaults and parameter schema. */
export function listEffectCatalog(): CatalogEntry[] {
  return STUDIO_EFFECTS.map((definition) => ({
    ...definition,
    params: getEffectParamSchema(definition.type)?.params ?? {},
    defaults: getDefaultParams(definition.type),
  }));
}

function withClipEffects(take: StudioTake, clipId: string, effects: ClipEffect[]) {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` as string };
  const tracks = [...(take.tracks ?? [])];
  const clips = [...found.track.clips];
  clips[found.clipIndex] = {
    ...found.clip,
    payload: { ...found.clip.payload, effects },
  };
  tracks[found.trackIndex] = { ...found.track, clips };
  return { take: { ...take, tracks } };
}

export interface AddClipEffectInput {
  type: StudioEffectType;
  intensity?: number;
  params?: Record<string, number | string | boolean>;
}

export function addClipEffect(
  take: StudioTake,
  clipId: string,
  input: AddClipEffectInput,
): { take: StudioTake; effect?: ClipEffect; error?: string } {
  if (!isStudioEffectType(input.type)) {
    return { take, error: `Unknown effect type: ${String(input.type)}` };
  }

  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };

  const existing = found.clip.payload?.effects ?? [];
  if (existing.length >= MAX_EFFECTS_PER_CLIP) {
    return {
      take,
      error: `Clip ${clipId} already has ${MAX_EFFECTS_PER_CLIP} effects (the maximum)`,
    };
  }

  const params = normalizeEffectParams(input.type, input.params);
  const validation = validateEffectParams(input.type, params);
  if (validation.valid === false) {
    return { take, error: validation.errors.join('; ') };
  }

  const intensity = input.intensity ?? 0.6;
  if (intensity < 0 || intensity > 1) {
    return { take, error: 'intensity must be between 0 and 1' };
  }

  const effect: ClipEffect = {
    id: `fx-${nanoid(8)}`,
    type: input.type,
    intensity,
    params,
    stackOrder: existing.length,
  };

  const result = withClipEffects(take, clipId, [...existing, effect]);
  if ('error' in result) return { take, error: result.error };
  return { take: result.take, effect };
}

export function removeClipEffect(
  take: StudioTake,
  clipId: string,
  effectId: string,
): { take: StudioTake; removed: boolean } {
  const found = findClip(take, clipId);
  if (!found) return { take, removed: false };
  const existing = found.clip.payload?.effects ?? [];
  const next = existing
    .filter((effect) => effect.id !== effectId)
    .map((effect, index) => ({ ...effect, stackOrder: index }));
  if (next.length === existing.length) return { take, removed: false };

  const result = withClipEffects(take, clipId, next);
  if ('error' in result) return { take, removed: false };

  // Intensity keyframes for a removed effect would otherwise leak forever.
  const keyframes = (found.clip.payload?.keyframes ?? []).filter(
    (keyframe) => keyframe.property !== effectIntensityProperty(effectId),
  );
  const withKeyframes = findClip(result.take, clipId);
  if (!withKeyframes) return { take: result.take, removed: true };
  const tracks = [...(result.take.tracks ?? [])];
  const clips = [...withKeyframes.track.clips];
  clips[withKeyframes.clipIndex] = {
    ...withKeyframes.clip,
    payload: { ...withKeyframes.clip.payload, keyframes },
  };
  tracks[withKeyframes.trackIndex] = {
    ...withKeyframes.track,
    clips,
  };

  return { take: { ...result.take, tracks }, removed: true };
}

export interface UpdateClipEffectInput {
  intensity?: number;
  params?: Record<string, number | string | boolean>;
}

export function updateClipEffect(
  take: StudioTake,
  clipId: string,
  effectId: string,
  patch: UpdateClipEffectInput,
): { take: StudioTake; effect?: ClipEffect; error?: string } {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };
  const existing = found.clip.payload?.effects ?? [];
  const index = existing.findIndex((effect) => effect.id === effectId);
  if (index === -1) return { take, error: `Effect ${effectId} not found on clip ${clipId}` };

  if (patch.intensity !== undefined && (patch.intensity < 0 || patch.intensity > 1)) {
    return { take, error: 'intensity must be between 0 and 1' };
  }

  const current = existing[index];
  const params = patch.params
    ? { ...current.params, ...patch.params }
    : current.params;
  const validation = validateEffectParams(current.type, params);
  if (validation.valid === false) {
    return { take, error: validation.errors.join('; ') };
  }

  const effect: ClipEffect = {
    ...current,
    ...(patch.intensity !== undefined ? { intensity: patch.intensity } : {}),
    params,
  };
  const next = [...existing];
  next[index] = effect;

  const result = withClipEffects(take, clipId, next);
  if ('error' in result) return { take, error: result.error };
  return { take: result.take, effect };
}

/** Set render order to exactly `effectIds` (a permutation of the clip's effects). */
export function reorderClipEffects(
  take: StudioTake,
  clipId: string,
  effectIds: readonly string[],
): { take: StudioTake; error?: string } {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };
  const existing = found.clip.payload?.effects ?? [];

  if (new Set(effectIds).size !== effectIds.length) {
    return { take, error: 'effectIds contains duplicate ids' };
  }
  if (effectIds.length !== existing.length) {
    return {
      take,
      error: `effectIds must list all ${existing.length} effects on this clip`,
    };
  }

  const byId = new Map(existing.map((effect) => [effect.id, effect]));
  const ordered: ClipEffect[] = [];
  for (const id of effectIds) {
    const effect = byId.get(id);
    if (!effect) return { take, error: `Unknown effect id: ${id}` };
    ordered.push({ ...effect, stackOrder: ordered.length });
  }

  const result = withClipEffects(take, clipId, ordered);
  if ('error' in result) return { take, error: result.error };
  return { take: result.take };
}

export interface AddEffectKeyframeInput {
  timeMs: number;
  intensity: number;
  easing?: StudioAnimationEasing;
}

export function addEffectKeyframe(
  take: StudioTake,
  clipId: string,
  effectId: string,
  input: AddEffectKeyframeInput,
): { take: StudioTake; keyframe?: StudioKeyframe; error?: string } {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };
  const effects = found.clip.payload?.effects ?? [];
  if (!effects.some((effect) => effect.id === effectId)) {
    return { take, error: `Effect ${effectId} not found on clip ${clipId}` };
  }
  if (input.intensity < 0 || input.intensity > 1) {
    return { take, error: 'intensity must be between 0 and 1' };
  }

  const keyframe: StudioKeyframe = {
    id: `kf-${nanoid(8)}`,
    timeMs: Math.max(0, Math.min(found.clip.durationMs, input.timeMs)),
    property: effectIntensityProperty(effectId),
    value: input.intensity,
    easing: input.easing ?? 'ease-out',
  };
  const keyframes = [...(found.clip.payload?.keyframes ?? []), keyframe];

  const tracks = [...(take.tracks ?? [])];
  const clips = [...found.track.clips];
  clips[found.clipIndex] = {
    ...found.clip,
    payload: { ...found.clip.payload, keyframes },
  };
  tracks[found.trackIndex] = { ...found.track, clips };
  return { take: { ...take, tracks }, keyframe };
}

export function removeEffectKeyframe(
  take: StudioTake,
  clipId: string,
  keyframeId: string,
): { take: StudioTake; removed: boolean } {
  const found = findClip(take, clipId);
  if (!found) return { take, removed: false };
  const keyframes = found.clip.payload?.keyframes ?? [];
  const next = keyframes.filter((keyframe) => keyframe.id !== keyframeId);
  if (next.length === keyframes.length) return { take, removed: false };

  const tracks = [...(take.tracks ?? [])];
  const clips = [...found.track.clips];
  clips[found.clipIndex] = {
    ...found.clip,
    payload: { ...found.clip.payload, keyframes: next },
  };
  tracks[found.trackIndex] = { ...found.track, clips };
  return { take: { ...take, tracks }, removed: true };
}
