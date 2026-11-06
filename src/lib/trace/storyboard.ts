/**
 * lib/trace/storyboard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storyboard helpers for Nova Trace.
 *
 * A storyboard is an ordered list of contiguous scenes inside a single
 * `TraceStage`. Scenes never introduce a second element graph: they are a
 * timeline/planning layer over the existing elements and property tracks.
 *
 * All functions here are pure. Store actions in
 * `lib/trace/slices/storyboard-slice.ts` own persistence and playback updates.
 *
 * Adapted from sagedesigns-os lib/motion/storyboard.ts.
 */

import type {
  TraceElement,
  TraceStage,
  TraceScene,
  TraceSourceRef,
  TraceStoryboard,
  PropertyTrack,
  SceneTransition,
} from './types';

export const DEFAULT_SCENE_DURATION_MS = 1500;

export interface AddSceneInput {
  /** Caller-supplied scene id. Generated when omitted. */
  id?: string;
  name?: string;
  durationMs?: number;
  intent?: string;
  transitionIn?: SceneTransition;
  background?: string;
  /** Insert immediately after this scene instead of appending. */
  afterSceneId?: string;
}

export interface AddSceneResult {
  storyboard: TraceStoryboard;
  scene: TraceScene;
}

export interface DuplicateSceneResult {
  storyboard: TraceStoryboard;
  scene: TraceScene;
  sourceScene: TraceScene;
}

export interface RemoveSceneResult {
  storyboard: TraceStoryboard;
  removed: TraceScene | null;
}

export interface DuplicatedSceneElements {
  elements: Record<string, TraceElement>;
  /** Root ids belonging to the duplicated scene, in their original order. */
  rootElementIds: string[];
}

let fallbackSceneCounter = 0;

/** Stable-enough scene id that works in Node tests and the browser. */
export function createSceneId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `scene-${uuid.slice(0, 8)}`;
  fallbackSceneCounter += 1;
  return `scene-${Date.now().toString(36)}-${fallbackSceneCounter}`;
}

function roundMs(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

export function createScene(input: Partial<TraceScene> = {}): TraceScene {
  return {
    id: input.id || createSceneId(),
    name: input.name?.trim() || 'Untitled Scene',
    startMs: Math.max(0, Math.round(input.startMs ?? 0)),
    durationMs: roundMs(
      input.durationMs ?? DEFAULT_SCENE_DURATION_MS,
      DEFAULT_SCENE_DURATION_MS,
    ),
    ...(input.intent !== undefined ? { intent: input.intent } : {}),
    transitionIn: input.transitionIn ?? 'cut',
    ...(input.background !== undefined ? { background: input.background } : {}),
  };
}

/**
 * Lay scenes out back-to-back in array order, starting at `startMs`.
 * The array order is the storyboard order; start times are derived.
 */
export function layoutScenes(scenes: TraceScene[], startMs = 0): TraceScene[] {
  let cursor = Math.max(0, Math.round(startMs));
  return scenes.map((scene) => {
    const durationMs = roundMs(scene.durationMs, DEFAULT_SCENE_DURATION_MS);
    const next: TraceScene = {
      ...scene,
      startMs: cursor,
      durationMs,
    };
    cursor += durationMs;
    return next;
  });
}

/** Total length of a storyboard, derived from the laid-out scene ranges. */
export function getStoryboardDuration(storyboard: TraceStoryboard): number {
  const scenes = storyboard.scenes ?? [];
  if (scenes.length === 0) return DEFAULT_SCENE_DURATION_MS;
  const last = scenes[scenes.length - 1];
  return Math.max(
    0,
    (last.startMs ?? 0) + (last.durationMs ?? DEFAULT_SCENE_DURATION_MS),
  );
}

/** Ensure a storyboard exists and is internally consistent. */
export function ensureStoryboard(input: {
  durationMs: number;
  storyboard?: TraceStoryboard;
}): TraceStoryboard {
  const durationMs = roundMs(input.durationMs, DEFAULT_SCENE_DURATION_MS);

  if (!input.storyboard || input.storyboard.scenes.length === 0) {
    const scene = createScene({
      id: 'scene-1',
      name: 'Scene 1',
      startMs: 0,
      durationMs,
    });
    return {
      scenes: [scene],
      activeSceneId: scene.id,
      sourceRefs: [],
    };
  }

  return input.storyboard;
}
export function addScene(
  storyboard: TraceStoryboard,
  input: AddSceneInput = {},
): AddSceneResult {
  const scene = createScene({
    ...input,
    id: input.id || createSceneId(),
  });
  const scenes = input.afterSceneId
    ? insertAfter(storyboard.scenes, scene, input.afterSceneId)
    : [...storyboard.scenes, scene];
  const laidOut = layoutScenes(scenes);
  return {
    storyboard: { ...storyboard, scenes: laidOut },
    scene: laidOut.find((s) => s.id === scene.id)!,
  };
}

function insertAfter(
  scenes: TraceScene[],
  scene: TraceScene,
  afterId: string,
): TraceScene[] {
  const idx = scenes.findIndex((s) => s.id === afterId);
  if (idx < 0) return [...scenes, scene];
  return [...scenes.slice(0, idx + 1), scene, ...scenes.slice(idx + 1)];
}

export function renameScene(
  storyboard: TraceStoryboard,
  sceneId: string,
  name: string,
): TraceStoryboard {
  const next = storyboard.scenes.map((s) =>
    s.id === sceneId ? { ...s, name } : s,
  );
  return { ...storyboard, scenes: next };
}

export function setSceneIntent(
  storyboard: TraceStoryboard,
  sceneId: string,
  intent: string,
): TraceStoryboard {
  const next = storyboard.scenes.map((s) =>
    s.id === sceneId ? { ...s, intent } : s,
  );
  return { ...storyboard, scenes: next };
}

export function resizeScene(
  storyboard: TraceStoryboard,
  sceneId: string,
  durationMs: number,
): TraceStoryboard {
  const next = storyboard.scenes.map((s) =>
    s.id === sceneId ? { ...s, durationMs } : s,
  );
  return { ...storyboard, scenes: layoutScenes(next) };
}

export function reorderScene(
  storyboard: TraceStoryboard,
  sceneId: string,
  index: number,
): TraceStoryboard {
  const scenes = [...storyboard.scenes];
  const from = scenes.findIndex((s) => s.id === sceneId);
  if (from < 0) return storyboard;
  const [scene] = scenes.splice(from, 1);
  scenes.splice(Math.min(index, scenes.length), 0, scene);
  return { ...storyboard, scenes: layoutScenes(scenes) };
}

export function removeScene(
  storyboard: TraceStoryboard,
  sceneId: string,
): RemoveSceneResult {
  const removed = storyboard.scenes.find((s) => s.id === sceneId) ?? null;
  const scenes = storyboard.scenes.filter((s) => s.id !== sceneId);
  return {
    storyboard:
      scenes.length > 0
        ? {
            ...storyboard,
            scenes: layoutScenes(scenes),
            activeSceneId:
              storyboard.activeSceneId === sceneId
                ? scenes[0]?.id
                : storyboard.activeSceneId,
          }
        : { ...storyboard, scenes: [], activeSceneId: undefined },
    removed,
  };
}

export function setActiveScene(
  storyboard: TraceStoryboard,
  sceneId: string,
): TraceStoryboard {
  if (storyboard.activeSceneId === sceneId) return storyboard;
  return { ...storyboard, activeSceneId: sceneId };
}

export function addSourceRef(
  storyboard: TraceStoryboard,
  ref: Omit<TraceSourceRef, 'id'>,
): { storyboard: TraceStoryboard; ref: TraceSourceRef } {
  const newRef: TraceSourceRef = { ...ref, id: createSceneId() };
  return {
    storyboard: {
      ...storyboard,
      sourceRefs: [...(storyboard.sourceRefs ?? []), newRef],
    },
    ref: newRef,
  };
}

export function removeSourceRef(
  storyboard: TraceStoryboard,
  sourceId: string,
): TraceStoryboard {
  return {
    ...storyboard,
    sourceRefs: (storyboard.sourceRefs ?? []).filter((r) => r.id !== sourceId),
  };
}
export function duplicateSceneElements(
  project: TraceStage,
  sourceSceneId: string,
  targetScene: TraceScene,
  timeOffsetMs: number,
): DuplicatedSceneElements {
  const sourceIds = getSceneElementIds(project, sourceSceneId);
  if (sourceIds.length === 0) {
    return { elements: {}, rootElementIds: [] };
  }

  const idMap = new Map<string, string>();
  for (const id of sourceIds) {
    idMap.set(id, `${id}__${targetScene.id}`);
  }

  const elements: Record<string, TraceElement> = {};
  for (const id of sourceIds) {
    const source = project.elements[id];
    if (!source) continue;
    const nextId = idMap.get(id)!;

    const nextParentId =
      source.parentId && idMap.has(source.parentId)
        ? idMap.get(source.parentId)!
        : (source.parentId ?? null);

    elements[nextId] = {
      ...source,
      id: nextId,
      sceneId: targetScene.id,
      parentId: nextParentId,
      childrenIds: (source.childrenIds ?? []).map(
        (childId) => idMap.get(childId) ?? childId,
      ),
      attributes: { ...source.attributes },
      tracks: cloneTracks(source.tracks ?? [], timeOffsetMs, targetScene.id),
    };
  }

  // Remap element-to-element references inside the cloned attributes.
  for (const element of Object.values(elements)) {
    const attributes = element.attributes;
    if (
      typeof attributes.motionPathTargetId === 'string' &&
      idMap.has(attributes.motionPathTargetId)
    ) {
      attributes.motionPathTargetId = idMap.get(attributes.motionPathTargetId);
    }
    if (
      typeof attributes.textPathTargetId === 'string' &&
      idMap.has(attributes.textPathTargetId)
    ) {
      attributes.textPathTargetId = idMap.get(attributes.textPathTargetId);
    }
  }

  const rootElementIds = project.rootElementIds
    .filter((id) => idMap.has(id))
    .map((id) => idMap.get(id)!);

  return { elements, rootElementIds };
}

function getSceneElementIds(project: TraceStage, sceneId: string): string[] {
  return Object.values(project.elements)
    .filter((el) => el.sceneId === sceneId)
    .map((el) => el.id);
}

function cloneTracks(
  tracks: PropertyTrack[],
  timeOffsetMs: number,
  sceneId: string,
): PropertyTrack[] {
  return tracks.map((track) => ({
    ...track,
    id: `${track.id}__${sceneId}`,
    keyframes: track.keyframes.map((kf) => ({
      ...kf,
      id: `${kf.id}__${sceneId}`,
      timeMs: kf.timeMs + timeOffsetMs,
    })),
  }));
}

/** Remove a scene's elements (including descendants) and prune them from any surviving parent's `childrenIds` and from the project roots. */
export function removeElementsForScene(
  project: TraceStage,
  sceneId: string,
): { elements: Record<string, TraceElement>; rootElementIds: string[] } {
  const direct = getSceneElementIds(project, sceneId);
  if (direct.length === 0) {
    return {
      elements: project.elements,
      rootElementIds: project.rootElementIds,
    };
  }

  const toDelete = new Set<string>(direct);
  const stack = [...direct];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const element = project.elements[id];
    for (const childId of element?.childrenIds ?? []) {
      if (!toDelete.has(childId)) {
        toDelete.add(childId);
        stack.push(childId);
      }
    }
  }

  const elements: Record<string, TraceElement> = {};
  for (const [id, element] of Object.entries(project.elements)) {
    if (toDelete.has(id)) continue;
    const childrenIds = (element.childrenIds ?? []).filter(
      (childId) => !toDelete.has(childId),
    );
    elements[id] =
      childrenIds.length === (element.childrenIds ?? []).length
        ? element
        : { ...element, childrenIds };
  }

  return {
    elements,
    rootElementIds: project.rootElementIds.filter((id) => !toDelete.has(id)),
  };
}
