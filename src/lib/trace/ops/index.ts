/**
 * lib/trace/ops/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Nova Trace ops engine: `applyOps` applies a batch of semantic operations
 * atomically to a TraceProject.
 *
 * Ops are the single mutation contract shared by the in-app copilot, the
 * export/publish pipeline and any future IPC surface. They are pure data: no
 * DOM, no database, no filesystem.
 *
 * Adapted from sagedesigns-os lib/motion/ops/index.ts.
 */

import type { Keyframe, TraceElement, TraceProject } from '../types';
import { lintTraceProject } from '../lint';
import type { Diagnostic, LintOptions } from '../lint/types';
import {
  ensureStoryboard,
  removeElementsForScene,
  type AddSceneInput,
} from '../storyboard';
import type {
  TraceApplyOpsOptions,
  TraceApplyOpsResult,
  TraceOp,
  TraceOpDiff,
  TraceProjectSnapshot,
} from './types';
import { TraceOpError } from './types';
import { createElementFromSpec } from './elements';
import { expandRecipe } from '../recipes';

let opCounter = 0;

/** Ids are deterministic-ish and collision-resistant without a dependency. */
function nextId(prefix: string): string {
  opCounter += 1;
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}-${opCounter}-${random}`;
}

/**
 * Op kinds that exist in the shared contract but have no Trace v1
 * implementation yet. They fail loudly instead of silently doing nothing.
 */
const UNSUPPORTED_OPS: Record<string, string> = {
  applyPose: 'Character rigs are not part of Nova Trace v1.',
  setBoneRotation: 'Character rigs are not part of Nova Trace v1.',
};

function emptyDiff(): TraceOpDiff {
  return {
    added: [],
    updated: [],
    removed: [],
    scenes: { added: [], updated: [], removed: [] },
  };
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneProject(project: TraceProject): TraceProject {
  return deepClone(project);
}

function snapshotOf(project: TraceProject): TraceProjectSnapshot {
  const clone = cloneProject(project);
  return {
    width: clone.width,
    height: clone.height,
    durationMs: clone.durationMs,
    fps: clone.fps,
    elements: clone.elements,
    rootElementIds: [...(clone.rootElementIds ?? [])],
    storyboard: clone.storyboard,
    defs: clone.defs,
    gradients: clone.gradients,
    audioTracks: clone.audioTracks,
  };
}

function findElement(project: TraceProject, id: string): TraceElement | null {
  return project.elements[id] ?? null;
}

function mustElement(project: TraceProject, id: string): TraceElement {
  const element = findElement(project, id);
  if (!element) {
    throw new TraceOpError(
      'ELEMENT_NOT_FOUND',
      `Element "${id}" does not exist.`,
    );
  }
  return element;
}

/** Depth-first ids of `rootId` and everything below it. */
function collectSubtree(project: TraceProject, rootId: string): string[] {
  const collected: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (collected.includes(id)) continue;
    const element = project.elements[id];
    if (!element) continue;
    collected.push(id);
    stack.push(...(element.childrenIds ?? []));
  }
  return collected;
}

function detachIds(project: TraceProject, ids: string[]): void {
  const removing = new Set(ids);
  project.rootElementIds = (project.rootElementIds ?? []).filter(
    (id) => !removing.has(id),
  );
  for (const element of Object.values(project.elements)) {
    if (!element.childrenIds?.length) continue;
    const kept = element.childrenIds.filter((id) => !removing.has(id));
    if (kept.length !== element.childrenIds.length) element.childrenIds = kept;
  }
}

function activeSceneId(project: TraceProject): string | null {
  const storyboard = ensureStoryboard(project);
  project.storyboard = storyboard;
  return storyboard.activeSceneId ?? storyboard.scenes[0]?.id ?? null;
}

function normalizeKeyframes(
  keyframes: {
    id?: string;
    timeMs: number;
    value: number | string;
    easing?: string;
  }[],
): Keyframe[] {
  return keyframes
    .map((keyframe) => ({
      id: keyframe.id ?? nextId('kf'),
      timeMs: Math.max(0, Math.round(keyframe.timeMs)),
      value: keyframe.value,
      easing: (keyframe.easing ?? 'ease') as Keyframe['easing'],
    }))
    .sort((a, b) => a.timeMs - b.timeMs);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function opSetCanvas(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'setCanvas' }>,
): void {
  if (op.width !== undefined) project.width = Math.max(1, Math.round(op.width));
  if (op.height !== undefined)
    project.height = Math.max(1, Math.round(op.height));
  if (op.durationMs !== undefined)
    project.durationMs = Math.max(1, Math.round(op.durationMs));
  if (op.fps !== undefined) project.fps = Math.max(1, Math.round(op.fps));
}

function opAddElement(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'addElement' }>,
): void {
  const spec = op.element;
  const id = spec.id ?? nextId('element');
  if (project.elements[id]) {
    throw new TraceOpError(
      'ELEMENT_DUPLICATE',
      `Element "${id}" already exists.`,
    );
  }

  const element = createElementFromSpec({ ...spec, id }, id);
  if (spec.sceneId === undefined) element.sceneId = activeSceneId(project);

  if (element.parentId) {
    const parent = mustElement(project, element.parentId);
    parent.childrenIds = [...(parent.childrenIds ?? []), id];
  } else {
    project.rootElementIds = [...(project.rootElementIds ?? []), id];
  }

  project.elements[id] = element;
}

function opApplyRecipe(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'applyRecipe' }>,
): string {
  const sceneId =
    op.sceneId === undefined ? activeSceneId(project) : op.sceneId;
  const expanded = expandRecipe(
    op.recipeId,
    {
      ...op.options,
      name: op.name ?? op.options?.name,
      x: op.x ?? op.options?.x,
      y: op.y ?? op.options?.y,
      sceneId,
    },
    (prefix) => nextId(prefix),
  );

  const ids = [expanded.root.id, ...expanded.children.map((child) => child.id)];
  const duplicateId = ids.find((id) => project.elements[id]);
  if (duplicateId) {
    throw new TraceOpError(
      'ELEMENT_DUPLICATE',
      `Recipe element "${duplicateId}" already exists.`,
    );
  }

  // Add root group element first
  project.elements[expanded.root.id] = expanded.root;
  project.rootElementIds = [
    ...(project.rootElementIds ?? []),
    expanded.root.id,
  ];

  // Add all recipe children
  for (const child of expanded.children) {
    project.elements[child.id] = child;
  }
  return expanded.rootId;
}

function opUpdateElement(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'updateElement' }>,
): void {
  const element = mustElement(project, op.id);
  if (op.name !== undefined) element.name = op.name;
  if (op.visible !== undefined) element.visible = op.visible;
  if (op.locked !== undefined) element.locked = op.locked;
  if (op.sceneId !== undefined) element.sceneId = op.sceneId;
  if (op.origin !== undefined) element.origin = { ...op.origin };

  if (op.attributes) {
    const attributes = { ...element.attributes };
    for (const [key, value] of Object.entries(op.attributes)) {
      if (value === null) delete attributes[key];
      else attributes[key] = value;
    }
    element.attributes = attributes;
  }
}

function opDeleteElement(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'deleteElement' }>,
): void {
  const ids = collectSubtree(project, op.id);
  if (ids.length === 0) {
    throw new TraceOpError(
      'ELEMENT_NOT_FOUND',
      `Element "${op.id}" does not exist.`,
    );
  }
  detachIds(project, ids);
  for (const id of ids) delete project.elements[id];
}

function opDuplicateElement(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'duplicateElement' }>,
): void {
  const source = mustElement(project, op.id);
  const offset = op.offset ?? { x: 0, y: 0 };
  const idMap = new Map<string, string>();

  for (const id of collectSubtree(project, op.id)) {
    idMap.set(id, id === op.id && op.newId ? op.newId : nextId('element'));
  }
  if (project.elements[op.newId ?? ''] && op.newId) {
    throw new TraceOpError(
      'ELEMENT_DUPLICATE',
      `Element "${op.newId}" already exists.`,
    );
  }

  for (const [sourceId, targetId] of idMap) {
    const original = project.elements[sourceId];
    if (!original) continue;
    const copy = deepClone(original);
    copy.id = targetId;
    if (sourceId === op.id && op.name) copy.name = op.name;
    if (sourceId === op.id) {
      copy.attributes = {
        ...copy.attributes,
        ...(typeof copy.attributes.baseX === 'number'
          ? { baseX: copy.attributes.baseX + offset.x }
          : { x: (copy.attributes.x ?? 0) + offset.x }),
        ...(typeof copy.attributes.baseY === 'number'
          ? { baseY: copy.attributes.baseY + offset.y }
          : { y: (copy.attributes.y ?? 0) + offset.y }),
      };
    }
    copy.parentId = original.parentId
      ? (idMap.get(original.parentId) ?? null)
      : null;
    copy.childrenIds = (original.childrenIds ?? [])
      .map((childId) => idMap.get(childId))
      .filter((childId): childId is string => Boolean(childId));
    project.elements[targetId] = copy;
  }

  const newRootId = idMap.get(op.id) as string;
  if (!source.parentId) {
    const roots = project.rootElementIds ?? [];
    const index = roots.indexOf(op.id);
    roots.splice(index < 0 ? roots.length : index + 1, 0, newRootId);
    project.rootElementIds = roots;
  }
}

function opReorderElement(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'reorderElement' }>,
): void {
  const element = mustElement(project, op.id);
  const siblings = element.parentId
    ? (mustElement(project, element.parentId).childrenIds ?? [])
    : (project.rootElementIds ?? []);
  const from = siblings.indexOf(op.id);
  if (from < 0) return;

  const ordered = [...siblings];
  ordered.splice(from, 1);

  const to =
    op.to === 'front'
      ? ordered.length
      : op.to === 'back'
        ? 0
        : op.to === 'forward'
          ? Math.min(from + 1, ordered.length)
          : Math.max(from - 1, 0);
  ordered.splice(to, 0, op.id);

  if (element.parentId) {
    mustElement(project, element.parentId).childrenIds = ordered;
  } else {
    project.rootElementIds = ordered;
  }
}

function opGroupElements(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'groupElements' }>,
): void {
  const ids = op.elementIds.filter((id) => Boolean(project.elements[id]));
  if (ids.length === 0) {
    throw new TraceOpError(
      'ELEMENT_NOT_FOUND',
      'groupElements received no existing elements.',
    );
  }

  const groupId = op.groupId ?? nextId('group');
  if (project.elements[groupId]) {
    throw new TraceOpError(
      'ELEMENT_DUPLICATE',
      `Element "${groupId}" already exists.`,
    );
  }

  const roots = project.rootElementIds ?? [];
  const anchor = Math.min(
    ...ids.map((id) => {
      const i = roots.indexOf(id);
      return i < 0 ? roots.length : i;
    }),
  );

  // First removed element's parent becomes the group's parent.
  const firstParentId = project.elements[ids[0]]?.parentId ?? null;

  detachIds(project, ids);
  for (const id of ids) {
    const element = project.elements[id];
    if (element) element.parentId = groupId;
  }

  const sceneId = project.elements[ids[0]]?.sceneId ?? null;
  project.elements[groupId] = {
    id: groupId,
    name: op.name ?? 'Group',
    type: 'group',
    visible: true,
    locked: false,
    sceneId,
    origin: { x: 0, y: 0 },
    attributes: { x: 0, y: 0, opacity: 1, childrenIds: ids },
    tracks: [],
    parentId: firstParentId,
    childrenIds: ids,
  };

  if (firstParentId) {
    const parent = mustElement(project, firstParentId);
    parent.childrenIds = [...(parent.childrenIds ?? []), groupId];
  } else {
    const nextRoots = project.rootElementIds ?? [];
    nextRoots.splice(Math.min(anchor, nextRoots.length), 0, groupId);
    project.rootElementIds = nextRoots;
  }
}

function opUngroupElement(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'ungroupElement' }>,
): void {
  const group = mustElement(project, op.id);
  const children = (group.childrenIds ?? []).filter((id) =>
    Boolean(project.elements[id]),
  );

  for (const id of children) {
    const child = project.elements[id];
    if (child) child.parentId = group.parentId ?? null;
  }

  if (group.parentId) {
    const parent = mustElement(project, group.parentId);
    parent.childrenIds = (parent.childrenIds ?? []).flatMap((id) =>
      id === group.id ? children : [id],
    );
  } else {
    const roots = project.rootElementIds ?? [];
    const index = roots.indexOf(group.id);
    roots.splice(
      index < 0 ? roots.length : index,
      index < 0 ? 0 : 1,
      ...children,
    );
    project.rootElementIds = roots;
  }

  delete project.elements[group.id];
}

function opSetElementScene(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'setElementScene' }>,
): void {
  const element = mustElement(project, op.id);
  element.sceneId = op.sceneId;
}

function opSetTrack(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'setTrack' }>,
): void {
  const element = mustElement(project, op.elementId);
  const tracks = element.tracks ?? [];
  const keyframes = normalizeKeyframes(op.keyframes);

  const existing = tracks.find((track) =>
    op.trackId ? track.id === op.trackId : track.property === op.property,
  );

  if (existing) {
    existing.keyframes = keyframes;
    existing.property = op.property;
    if (op.label) existing.label = op.label;
  } else {
    tracks.push({
      id: op.trackId ?? nextId('track'),
      property: op.property,
      label: op.label ?? op.property,
      keyframes,
    });
  }

  element.tracks = tracks;
}

function opDeleteTrack(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'deleteTrack' }>,
): void {
  const element = mustElement(project, op.elementId);
  element.tracks = (element.tracks ?? []).filter(
    (track) => track.property !== op.property,
  );
}

function opAddScene(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'addScene' }>,
): void {
  const storyboard = ensureStoryboard(project);
  const input: AddSceneInput = {
    name: op.name,
    durationMs: op.durationMs,
    intent: op.intent,
    transitionIn: op.transitionIn,
    background: op.background,
    afterSceneId: op.afterSceneId,
  };

  const scene = {
    id: nextId('scene'),
    name: input.name?.trim() || 'Untitled Scene',
    startMs: 0,
    durationMs: Math.max(1, Math.round(input.durationMs ?? 1500)),
    ...(input.intent !== undefined ? { intent: input.intent } : {}),
    transitionIn: input.transitionIn ?? 'cut',
    ...(input.background !== undefined ? { background: input.background } : {}),
  } as const;

  const scenes = [...storyboard.scenes];
  const anchor = op.afterSceneId
    ? scenes.findIndex((entry) => entry.id === op.afterSceneId)
    : -1;
  scenes.splice(anchor < 0 ? scenes.length : anchor + 1, 0, scene);

  let cursor = 0;
  project.storyboard = {
    ...storyboard,
    scenes: scenes.map((entry) => {
      const next = {
        ...entry,
        startMs: cursor,
        durationMs: Math.max(1, Math.round(entry.durationMs)),
      };
      cursor += next.durationMs;
      return next;
    }),
    activeSceneId: storyboard.activeSceneId ?? scene.id,
  };
  project.durationMs = Math.max(project.durationMs ?? 1, cursor);
}

function opUpdateScene(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'updateScene' }>,
): void {
  const storyboard = ensureStoryboard(project);
  if (!storyboard.scenes.some((scene) => scene.id === op.id)) {
    throw new TraceOpError(
      'SCENE_NOT_FOUND',
      `Scene "${op.id}" does not exist.`,
    );
  }

  project.storyboard = {
    ...storyboard,
    scenes: storyboard.scenes.map((scene) =>
      scene.id === op.id
        ? {
            ...scene,
            ...(op.name !== undefined ? { name: op.name } : {}),
            ...(op.intent !== undefined ? { intent: op.intent } : {}),
            ...(op.durationMs !== undefined
              ? { durationMs: Math.max(1, Math.round(op.durationMs)) }
              : {}),
            ...(op.transitionIn !== undefined
              ? { transitionIn: op.transitionIn }
              : {}),
            ...(op.background !== undefined
              ? { background: op.background }
              : {}),
          }
        : scene,
    ),
  };
}

function opRemoveScene(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'removeScene' }>,
): void {
  const storyboard = ensureStoryboard(project);
  if (!storyboard.scenes.some((scene) => scene.id === op.id)) {
    throw new TraceOpError(
      'SCENE_NOT_FOUND',
      `Scene "${op.id}" does not exist.`,
    );
  }

  const remaining = storyboard.scenes.filter((scene) => scene.id !== op.id);
  let cursor = 0;
  project.storyboard = {
    ...storyboard,
    scenes: remaining.map((scene) => {
      const next = { ...scene, startMs: cursor };
      cursor += scene.durationMs;
      return next;
    }),
    activeSceneId:
      storyboard.activeSceneId === op.id
        ? (remaining[0]?.id ?? null)
        : storyboard.activeSceneId,
  };

  const pruned = removeElementsForScene(project, op.id);
  project.elements = pruned.elements;
  project.rootElementIds = pruned.rootElementIds;
}

function opReorderScene(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'reorderScene' }>,
): void {
  const storyboard = ensureStoryboard(project);
  const from = storyboard.scenes.findIndex((scene) => scene.id === op.id);
  if (from < 0)
    throw new TraceOpError(
      'SCENE_NOT_FOUND',
      `Scene "${op.id}" does not exist.`,
    );

  const scenes = [...storyboard.scenes];
  const [moved] = scenes.splice(from, 1);
  scenes.splice(Math.max(0, Math.min(op.index, scenes.length)), 0, moved);

  let cursor = 0;
  project.storyboard = {
    ...storyboard,
    scenes: scenes.map((scene) => {
      const next = { ...scene, startMs: cursor };
      cursor += scene.durationMs;
      return next;
    }),
  };
}

function opSetActiveScene(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'setActiveScene' }>,
): void {
  const storyboard = ensureStoryboard(project);
  if (!storyboard.scenes.some((scene) => scene.id === op.id)) {
    throw new TraceOpError(
      'SCENE_NOT_FOUND',
      `Scene "${op.id}" does not exist.`,
    );
  }
  project.storyboard = { ...storyboard, activeSceneId: op.id };
}

function opInsertFragment(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'insertFragment' }>,
): void {
  const { fragment } = op;
  const suffix = op.suffix ? `-${op.suffix}` : nextId('frag');
  const idMap = new Map<string, string>();

  for (const id of Object.keys(fragment.elements)) {
    let candidate = `${id}${suffix}`;
    let attempt = 1;
    while (project.elements[candidate]) {
      attempt += 1;
      candidate = `${id}${suffix}-${attempt}`;
    }
    idMap.set(id, candidate);
  }

  const sceneId =
    op.sceneId === null ? null : (op.sceneId ?? activeSceneId(project));

  for (const [sourceId, targetId] of idMap) {
    const source = fragment.elements[sourceId];
    if (!source) continue;
    const copy = deepClone(source);
    copy.id = targetId;
    copy.sceneId = sceneId;
    copy.parentId = source.parentId
      ? (idMap.get(source.parentId) ?? null)
      : null;
    copy.childrenIds = (source.childrenIds ?? [])
      .map((childId) => idMap.get(childId))
      .filter((childId): childId is string => Boolean(childId));
    project.elements[targetId] = copy;
  }

  const roots = fragment.rootElementIds
    .map((id) => idMap.get(id))
    .filter((id): id is string => Boolean(id));

  if (op.groupId) {
    const group = mustElement(project, op.groupId);
    group.childrenIds = [...(group.childrenIds ?? []), ...roots];
    for (const id of roots) {
      const element = project.elements[id];
      if (element) element.parentId = group.id;
    }
  } else {
    project.rootElementIds = [...(project.rootElementIds ?? []), ...roots];
  }
}

function opSetDefs(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'setDefs' }>,
): void {
  project.defs = op.defs;
}

function opSetAudio(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'setAudio' }>,
): void {
  project.audioTracks = deepClone(op.tracks);
}

function opRestore(
  project: TraceProject,
  op: Extract<TraceOp, { type: 'restore' }>,
): void {
  const snapshot = op.snapshot;
  project.width = snapshot.width;
  project.height = snapshot.height;
  project.durationMs = snapshot.durationMs;
  project.fps = snapshot.fps;
  project.elements = snapshot.elements;
  project.rootElementIds = [...(snapshot.rootElementIds ?? [])];
  project.storyboard = snapshot.storyboard;
  project.defs = snapshot.defs;
  project.gradients = snapshot.gradients;
  project.audioTracks = snapshot.audioTracks;
}

function applyOne(
  project: TraceProject,
  op: TraceOp,
  onDiagnostic: (diagnostic: Diagnostic) => void,
): string | undefined {
  const unsupported = UNSUPPORTED_OPS[op.type];
  if (unsupported) {
    onDiagnostic({
      code: 'OP_UNSUPPORTED',
      severity: 'warning',
      message: `${op.type}: ${unsupported}`,
      fix: 'Remove the op from the batch or implement the missing subsystem.',
    });
    return;
  }

  switch (op.type) {
    case 'setCanvas':
      opSetCanvas(project, op);
      return;
    case 'addElement':
      opAddElement(project, op);
      return;
    case 'updateElement':
      opUpdateElement(project, op);
      return;
    case 'deleteElement':
      opDeleteElement(project, op);
      return;
    case 'duplicateElement':
      opDuplicateElement(project, op);
      return;
    case 'reorderElement':
      opReorderElement(project, op);
      return;
    case 'groupElements':
      opGroupElements(project, op);
      return;
    case 'ungroupElement':
      opUngroupElement(project, op);
      return;
    case 'setElementScene':
      opSetElementScene(project, op);
      return;
    case 'setTrack':
      opSetTrack(project, op);
      return;
    case 'deleteTrack':
      opDeleteTrack(project, op);
      return;
    case 'addScene':
      opAddScene(project, op);
      return;
    case 'updateScene':
      opUpdateScene(project, op);
      return;
    case 'removeScene':
      opRemoveScene(project, op);
      return;
    case 'reorderScene':
      opReorderScene(project, op);
      return;
    case 'setActiveScene':
      opSetActiveScene(project, op);
      return;
    case 'insertFragment':
      opInsertFragment(project, op);
      return;
    case 'applyRecipe':
      return opApplyRecipe(project, op);
    case 'setDefs':
      opSetDefs(project, op);
      return;
    case 'setAudio':
      opSetAudio(project, op);
      return;
    case 'restore':
      opRestore(project, op);
      return;
    default:
      onDiagnostic({
        code: 'UNKNOWN_OP_TYPE',
        severity: 'error',
        message: `Unknown op type: ${(op as { type?: string }).type ?? 'undefined'}`,
        fix: 'Send an op type from the TraceOp union.',
      });
  }
}

function diffProjects(before: TraceProject, after: TraceProject): TraceOpDiff {
  const diff = emptyDiff();

  const beforeIds = new Set(Object.keys(before.elements ?? {}));
  const afterIds = new Set(Object.keys(after.elements ?? {}));

  for (const id of afterIds) {
    if (!beforeIds.has(id)) diff.added.push(id);
    else if (
      JSON.stringify(before.elements[id]) !== JSON.stringify(after.elements[id])
    ) {
      diff.updated.push(id);
    }
  }
  for (const id of beforeIds) {
    if (!afterIds.has(id)) diff.removed.push(id);
  }

  const beforeScenes = before.storyboard?.scenes ?? [];
  const afterScenes = after.storyboard?.scenes ?? [];
  const beforeSceneIds = new Set(beforeScenes.map((scene) => scene.id));
  const afterSceneIds = new Set(afterScenes.map((scene) => scene.id));

  for (const scene of afterScenes) {
    if (!beforeSceneIds.has(scene.id)) diff.scenes.added.push(scene.id);
    else {
      const previous = beforeScenes.find((entry) => entry.id === scene.id);
      if (JSON.stringify(previous) !== JSON.stringify(scene))
        diff.scenes.updated.push(scene.id);
    }
  }
  for (const scene of beforeScenes) {
    if (!afterSceneIds.has(scene.id)) diff.scenes.removed.push(scene.id);
  }

  return diff;
}

/**
 * Apply a batch of ops atomically.
 *
 * A batch either lands completely or not at all: if any handler throws, the
 * original project is returned untouched with `applied: 0`.
 */
export function applyOps(
  project: TraceProject,
  ops: TraceOp[],
  options: TraceApplyOpsOptions = {},
): TraceApplyOpsResult {
  const diagnostics: Diagnostic[] = [];
  const original = cloneProject(project);
  const draft = cloneProject(project);
  const recipeRootIds: string[] = [];

  try {
    for (const op of ops) {
      const rootId = applyOne(draft, op, (diagnostic) =>
        diagnostics.push(diagnostic),
      );
      if (rootId) recipeRootIds.push(rootId);
    }
  } catch (error) {
    diagnostics.push({
      code: 'OP_EXECUTION_ERROR',
      severity: 'error',
      message:
        error instanceof TraceOpError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Unknown op error',
      fix: 'Fix the offending op and resend the whole batch.',
    });
    return {
      ok: false,
      project: original,
      applied: 0,
      diff: emptyDiff(),
      recipeRootIds: [],
      diagnostics,
      inverse: [],
    };
  }

  const lintOptions: LintOptions | undefined = options.lintOptions;
  diagnostics.push(...lintTraceProject(draft, lintOptions).diagnostics);

  const inverse: TraceOp[] = options.includeInverse
    ? [{ type: 'restore', snapshot: snapshotOf(original) }]
    : [];

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    project: draft,
    applied: ops.length,
    diff: diffProjects(original, draft),
    recipeRootIds,
    diagnostics,
    inverse,
  };
}
