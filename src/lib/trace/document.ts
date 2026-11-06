/**
 * lib/trace/document.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Read helpers for the v2 Trace document.
 *
 * A v2 document nests element graphs inside artboards and named clips inside
 * artboards. Nothing here mutates: the helpers exist so callers never hard-code
 * `document.artboards[document.activeArtboardId]` or walk every artboard by hand.
 *
 * These are intentionally tolerant of partially-repaired documents (missing
 * order arrays, unknown ids) because they run on projects opened from disk.
 */

import { createBlankTraceStage, TRACE_DEFAULT_DURATION_MS } from './defaults';
import {
  TRACE_DEFAULT_ANIMATION_ID,
  TRACE_DEFAULT_ARTBOARD_ID,
} from './schema';
import { getStoryboardDuration } from './storyboard';
import type {
  PropertyTrack,
  TraceAnimation,
  TraceArtboard,
  TraceDocument,
  TraceElement,
  TraceStage,
  TraceStageInput,
} from './types';

/** Artboards in author order, with any unlisted artboard appended. */
export function artboardList(document: TraceDocument): TraceArtboard[] {
  const artboards = document.artboards ?? {};
  const order = document.artboardOrder ?? [];
  const list: TraceArtboard[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    const artboard = artboards[id];
    if (artboard && !seen.has(id)) {
      list.push(artboard);
      seen.add(id);
    }
  }

  for (const [id, artboard] of Object.entries(artboards)) {
    if (!seen.has(id)) list.push(artboard);
  }

  return list;
}

/** The requested artboard, else the active one, else the first in author order. */
export function activeArtboard(
  document: TraceDocument,
  artboardId?: string | null,
): TraceArtboard | null {
  const artboards = document.artboards ?? {};
  if (artboardId && artboards[artboardId]) return artboards[artboardId];
  const active = artboards[document.activeArtboardId];
  if (active) return active;
  return artboardList(document)[0] ?? null;
}

/** The artboard that owns an element, or null when the id is unknown. */
export function artboardOf(
  document: TraceDocument,
  elementId: string,
): TraceArtboard | null {
  for (const artboard of artboardList(document)) {
    if (artboard.elements?.[elementId]) return artboard;
  }
  return null;
}

/** The requested animation, else the artboard default, else the first. */
export function animationOf(
  artboard: TraceArtboard,
  animationId?: string | null,
): TraceAnimation | null {
  const animations = artboard.animations ?? [];
  if (animationId) {
    const match = animations.find((animation) => animation.id === animationId);
    if (match) return match;
  }
  const fallback =
    animations.find((animation) => animation.id === artboard.defaultAnimationId) ??
    animations[0];
  return fallback ?? null;
}

/**
 * Tracks owned by one animation. Tracks written by a v1 editor have no
 * `animationId`; run `migrateTraceDocument` before sampling so every track is
 * tagged.
 */
export function tracksOf(
  element: TraceElement,
  animationId: string,
): PropertyTrack[] {
  return (element.tracks ?? []).filter(
    (track) => track.animationId === animationId,
  );
}

/**
 * Elements visible for a scene. Scene-less elements are global and always
 * included. Passing no `sceneId` returns everything, which matches the current
 * stage behaviour: scenes organise the timeline but do not filter rendering.
 */
export function elementsInScene(
  document: TraceDocument,
  sceneId?: string | null,
  artboardId?: string,
): TraceElement[] {
  const artboards = artboardId
    ? [activeArtboard(document, artboardId)].filter(
        (artboard): artboard is TraceArtboard => artboard !== null,
      )
    : artboardList(document);

  const elements: TraceElement[] = [];
  for (const artboard of artboards) {
    for (const element of Object.values(artboard.elements ?? {})) {
      if (
        sceneId != null &&
        element.sceneId != null &&
        element.sceneId !== sceneId
      ) {
        continue;
      }
      elements.push(element);
    }
  }
  return elements;
}

/**
 * Program duration: the longest authored animation, extended by the storyboard
 * when the cut list runs longer. `budget.durationMs` is only a floor, so an
 * empty document still reports a usable length.
 */
export function programDurationOf(document: TraceDocument): number {
  let longest = 0;

  for (const artboard of artboardList(document)) {
    for (const animation of artboard.animations ?? []) {
      const duration = Number(animation.durationMs);
      if (Number.isFinite(duration)) longest = Math.max(longest, duration);
    }
  }

  const scenes = document.storyboard?.scenes ?? [];
  if (scenes.length > 0 && document.storyboard) {
    longest = Math.max(longest, getStoryboardDuration(document.storyboard));
  }

  if (longest > 0) return Math.round(longest);

  const stored = Number(document.durationMs);
  return Number.isFinite(stored) && stored > 0
    ? Math.round(stored)
    : TRACE_DEFAULT_DURATION_MS;
}

/* ── Stage projection ────────────────────────────────────────────────────────
 *
 * The editor edits one artboard at a time. `stageOf` projects it into the flat
 * shape ops already speak; `withStage` writes it back. These two functions are
 * the only place that knows an artboard exists, which is what keeps the ops
 * engine, the linter and the templates unaware of the nesting.
 */

/** The stage for an artboard, defaulting to the active one. */
export function stageOf(
  source: TraceDocument | TraceStageInput,
  artboardId?: string | null,
): TraceStage {
  // Already a stage (a template authoring view, a helper parameter): identity.
  if (!('artboards' in source)) {
    const stage = source as TraceStageInput;
    if (stage.artboardId && stage.animationId) return stage as TraceStage;
    return {
      ...stage,
      artboardId: stage.artboardId ?? TRACE_DEFAULT_ARTBOARD_ID,
      animationId: stage.animationId ?? TRACE_DEFAULT_ANIMATION_ID,
    };
  }

  const document = source as TraceDocument;
  const artboard = activeArtboard(document, artboardId);

  if (!artboard) {
    return {
      artboardId: artboardId ?? TRACE_DEFAULT_ARTBOARD_ID,
      animationId: TRACE_DEFAULT_ANIMATION_ID,
      name: document.name,
      width: document.width,
      height: document.height,
      durationMs: document.durationMs,
      fps: document.fps,
      elements: {},
      rootElementIds: [],
      audioTracks: document.audioTracks,
      storyboard: document.storyboard,
    };
  }

  const animation = animationOf(artboard);

  return {
    artboardId: artboard.id,
    animationId:
      animation?.id ??
      artboard.defaultAnimationId ??
      TRACE_DEFAULT_ANIMATION_ID,
    name: artboard.name,
    width: artboard.width,
    height: artboard.height,
    durationMs: document.durationMs,
    fps: document.fps,
    elements: artboard.elements ?? {},
    rootElementIds: artboard.rootElementIds ?? [],
    defs: artboard.defs,
    gradients: artboard.gradients,
    audioTracks: document.audioTracks,
    storyboard: document.storyboard,
  };
}

/**
 * Write an edited stage back into its artboard.
 *
 * v2.0 has a single animation per artboard, so the artboard's default animation
 * follows the stage duration. Multi-animation timing arrives with the state
 * machine phase, where a duration becomes per-clip rather than per-document.
 */
export function withStage(
  document: TraceDocument,
  stage: TraceStage,
): TraceDocument {
  const existing =
    document.artboards?.[stage.artboardId] ?? activeArtboard(document);
  const animation = existing ? animationOf(existing, stage.animationId) : null;
  const animationId = animation?.id ?? stage.animationId;

  const animations = (existing?.animations ?? [
    {
      id: animationId,
      name: 'Animation 1',
      durationMs: stage.durationMs,
      loop: 'none' as const,
    },
  ]).map((entry) =>
    entry.id === animationId
      ? { ...entry, durationMs: stage.durationMs }
      : entry,
  );

  const artboard: TraceArtboard = {
    id: existing?.id ?? stage.artboardId,
    name: stage.name,
    width: stage.width,
    height: stage.height,
    background: existing?.background,
    elements: stage.elements,
    rootElementIds: stage.rootElementIds,
    defs: stage.defs,
    gradients: stage.gradients,
    animations,
    animationOrder: existing?.animationOrder ?? animations.map((a) => a.id),
    defaultAnimationId: existing?.defaultAnimationId ?? animationId,
    componentId: existing?.componentId,
  };

  const isActive = artboard.id === document.activeArtboardId;

  return {
    ...document,
    width: isActive ? stage.width : document.width,
    height: isActive ? stage.height : document.height,
    durationMs: stage.durationMs,
    fps: stage.fps,
    artboards: { ...document.artboards, [artboard.id]: artboard },
    storyboard: stage.storyboard,
    audioTracks: stage.audioTracks,
  };
}

/** Build a one-artboard v2 document from authored stage data. */
export function documentFromStage(stage: TraceStage): TraceDocument {
  const animationId = stage.animationId || TRACE_DEFAULT_ANIMATION_ID;
  const elements: Record<string, TraceElement> = {};

  for (const [elementId, element] of Object.entries(stage.elements ?? {})) {
    elements[elementId] = {
      ...element,
      tracks: (element.tracks ?? []).map((track) => ({
        ...track,
        animationId: track.animationId ?? animationId,
      })),
    };
  }

  const animation: TraceAnimation = {
    id: animationId,
    name: 'Animation 1',
    durationMs: stage.durationMs,
    loop: 'none',
  };

  return {
    id: stage.id ?? stage.artboardId,
    schemaVersion: 2,
    name: stage.name,
    width: stage.width,
    height: stage.height,
    durationMs: stage.durationMs,
    fps: stage.fps,
    artboards: {
      [stage.artboardId]: {
        id: stage.artboardId,
        name: stage.name,
        width: stage.width,
        height: stage.height,
        elements,
        rootElementIds: [...(stage.rootElementIds ?? [])],
        defs: stage.defs,
        gradients: stage.gradients,
        animations: [animation],
        animationOrder: [animationId],
        defaultAnimationId: animationId,
      },
    },
    artboardOrder: [stage.artboardId],
    activeArtboardId: stage.artboardId,
    storyboard: stage.storyboard,
    audioTracks: stage.audioTracks,
  };
}

/** A blank v2 document: one empty artboard and one empty animation. */
export function createBlankTraceDocument(
  name = 'Untitled Trace',
  overrides: Partial<TraceStage> = {},
): TraceDocument {
  return documentFromStage(createBlankTraceStage(name, overrides));
}

/** `stageOf` for a store field that may be empty. */
export function stageOrNull(
  source: TraceDocument | TraceStageInput | null | undefined,
): TraceStage | null {
  return source ? stageOf(source) : null;
}
