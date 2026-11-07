/**
 * lib/trace/hierarchy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure hierarchy math for layer-tree edits.
 *
 * Elements carry a translate/rotate/scale transform whose rotation and scale
 * pivot around a local `origin`. Reparenting keeps a layer visually still by
 * rewriting its local transform against the new parent's world matrix.
 *
 * Matrices use the SVG convention:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */

import type { Point, TraceElement, TraceProject } from './types';

export interface TraceMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface TraceTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  origin: Point;
}

export const IDENTITY_MATRIX: TraceMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

export function multiplyMatrices(
  outer: TraceMatrix,
  inner: TraceMatrix,
): TraceMatrix {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function invertMatrix(matrix: TraceMatrix): TraceMatrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    return { ...IDENTITY_MATRIX };
  }
  const inverse = 1 / determinant;
  const a = matrix.d * inverse;
  const b = -matrix.b * inverse;
  const c = -matrix.c * inverse;
  const d = matrix.a * inverse;
  return {
    a,
    b,
    c,
    d,
    e: -(a * matrix.e + c * matrix.f),
    f: -(b * matrix.e + d * matrix.f),
  };
}

export function applyMatrix(matrix: TraceMatrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

export function matricesEqual(
  left: TraceMatrix,
  right: TraceMatrix,
  epsilon = 1e-9,
): boolean {
  return (
    Math.abs(left.a - right.a) <= epsilon &&
    Math.abs(left.b - right.b) <= epsilon &&
    Math.abs(left.c - right.c) <= epsilon &&
    Math.abs(left.d - right.d) <= epsilon &&
    Math.abs(left.e - right.e) <= epsilon &&
    Math.abs(left.f - right.f) <= epsilon
  );
}

function numberOr(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/** Static (time-zero) transform of an element, honouring base position. */
export function elementTransform(element: TraceElement): TraceTransform {
  const attributes = element.attributes ?? {};
  const hasBase =
    typeof attributes.baseX === 'number' ||
    typeof attributes.baseY === 'number';
  const x = hasBase
    ? numberOr(attributes.baseX, 0) + numberOr(attributes.x, 0)
    : numberOr(attributes.x, 0);
  const y = hasBase
    ? numberOr(attributes.baseY, 0) + numberOr(attributes.y, 0)
    : numberOr(attributes.y, 0);
  return {
    x,
    y,
    rotation: numberOr(attributes.rotation, 0),
    scaleX: numberOr(attributes.scaleX, 1),
    scaleY: numberOr(attributes.scaleY, 1),
    origin: element.origin ?? { x: 0, y: 0 },
  };
}

export function matrixForTransform(transform: TraceTransform): TraceMatrix {
  const radians = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const a = cos * transform.scaleX;
  const b = sin * transform.scaleX;
  const c = -sin * transform.scaleY;
  const d = cos * transform.scaleY;
  const origin = transform.origin;
  return {
    a,
    b,
    c,
    d,
    e: origin.x + transform.x - (a * origin.x + c * origin.y),
    f: origin.y + transform.y - (b * origin.x + d * origin.y),
  };
}

export function elementMatrix(element: TraceElement): TraceMatrix {
  return matrixForTransform(elementTransform(element));
}

/** Local↔artboard matrix for `elementId`, including every ancestor. */
export function worldMatrix(
  project: TraceProject,
  elementId: string,
): TraceMatrix {
  const chain: TraceElement[] = [];
  const guard = new Set<string>();
  let cursor: string | null | undefined = elementId;

  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const element = project.elements[cursor];
    if (!element) break;
    chain.unshift(element);
    cursor = element.parentId ?? null;
  }

  return chain.reduce<TraceMatrix>(
    (world, element) => multiplyMatrices(world, elementMatrix(element)),
    { ...IDENTITY_MATRIX },
  );
}

/** True when `elementId` lives below `possibleAncestorId`. */
export function isElementDescendant(
  project: TraceProject,
  elementId: string,
  possibleAncestorId: string,
): boolean {
  const guard = new Set<string>([elementId]);
  let cursor = project.elements[elementId]?.parentId ?? null;
  while (cursor && !guard.has(cursor)) {
    if (cursor === possibleAncestorId) return true;
    guard.add(cursor);
    cursor = project.elements[cursor]?.parentId ?? null;
  }
  return false;
}

export function checkReparent(
  project: TraceProject,
  elementId: string,
  parentId: string | null,
): { allowed: boolean; reason: string } {
  if (!project.elements[elementId]) {
    return { allowed: false, reason: `Element "${elementId}" does not exist.` };
  }
  if (!parentId) return { allowed: true };
  if (parentId === elementId) {
    return { allowed: false, reason: 'A layer cannot be its own parent.' };
  }
  if (!project.elements[parentId]) {
    return { allowed: false, reason: `Parent "${parentId}" does not exist.` };
  }
  if (isElementDescendant(project, parentId, elementId)) {
    return {
      allowed: false,
      reason: 'A layer cannot be moved into its own subtree.',
    };
  }
  return { allowed: true };
}

/** Decompose an affine matrix into the document's translate/rotate/scale model. */
export function matrixToTransform(
  matrix: TraceMatrix,
  origin: Point,
): Omit<TraceTransform, 'origin'> {
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  const scaleY = scaleX === 0 ? 1 : determinant / scaleX;
  const rotation = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;

  // Translation is expressed before the origin pivot.
  return {
    x: matrix.e - origin.x + (matrix.a * origin.x + matrix.c * origin.y),
    y: matrix.f - origin.y + (matrix.b * origin.x + matrix.d * origin.y),
    rotation,
    scaleX: Number.isFinite(scaleX) && scaleX !== 0 ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) && scaleY !== 0 ? scaleY : 1,
  };
}

function writeTransform(element: TraceElement, transform: TraceTransform): void {
  const attributes = { ...(element.attributes ?? {}) };
  const baseX =
    typeof attributes.baseX === 'number' ? attributes.baseX : undefined;
  const baseY =
    typeof attributes.baseY === 'number' ? attributes.baseY : undefined;

  attributes.x = transform.x - (baseX ?? 0);
  attributes.y = transform.y - (baseY ?? 0);
  attributes.rotation = transform.rotation;
  attributes.scaleX = transform.scaleX;
  attributes.scaleY = transform.scaleY;
  element.attributes = attributes;
}

/**
 * Re-express `element`'s local transform so that its artboard transform stays
 * `world` while parented to `parentId`.
 */
export function applyWorldTransform(
  project: TraceProject,
  element: TraceElement,
  world: TraceMatrix,
  parentId: string | null,
): void {
  const parentWorld = parentId
    ? worldMatrix(project, parentId)
    : { ...IDENTITY_MATRIX };
  const local = multiplyMatrices(invertMatrix(parentWorld), world);
  const origin = element.origin ?? { x: 0, y: 0 };
  writeTransform(element, { ...matrixToTransform(local, origin), origin });
}

export function siblingIds(
  project: TraceProject,
  parentId: string | null,
): string[] {
  if (!parentId) return project.rootElementIds ?? [];
  return project.elements[parentId]?.childrenIds ?? [];
}

export function detachFromParent(
  project: TraceProject,
  elementId: string,
): void {
  project.rootElementIds = (project.rootElementIds ?? []).filter(
    (id) => id !== elementId,
  );
  for (const element of Object.values(project.elements)) {
    if (!element.childrenIds?.includes(elementId)) continue;
    element.childrenIds = element.childrenIds.filter((id) => id !== elementId);
  }
}

export function insertIntoParent(
  project: TraceProject,
  parentId: string | null,
  elementId: string,
  index: number,
): void {
  const siblings = siblingIds(project, parentId);
  const clamped = Math.max(0, Math.min(index, siblings.length));
  siblings.splice(clamped, 0, elementId);
  if (parentId) {
    const parent = project.elements[parentId];
    if (parent) parent.childrenIds = siblings;
  } else {
    project.rootElementIds = siblings;
  }
}

/** Move an element without changing how it looks on the artboard. */
export function reparentInProject(
  project: TraceProject,
  elementId: string,
  parentId: string | null,
  index?: number,
): void {
  const check = checkReparent(project, elementId, parentId);
  if (!check.allowed) throw new Error(check.reason);

  const element = project.elements[elementId];
  const world = worldMatrix(project, elementId);
  const previousParentWorld = element.parentId
    ? worldMatrix(project, element.parentId)
    : { ...IDENTITY_MATRIX };

  detachFromParent(project, elementId);
  element.parentId = parentId;
  const siblings = siblingIds(project, parentId);
  insertIntoParent(
    project,
    parentId,
    elementId,
    index ?? siblings.length,
  );

  const nextParentWorld = parentId
    ? worldMatrix(project, parentId)
    : { ...IDENTITY_MATRIX };
  if (!matricesEqual(previousParentWorld, nextParentWorld)) {
    applyWorldTransform(project, element, world, parentId);
  }
}

/** Depth-first paint order, bottom (0) to top. */
export function paintOrder(project: TraceProject): string[] {
  const ordered: string[] = [];
  const guard = new Set<string>();
  const visit = (elementId: string) => {
    if (guard.has(elementId)) return;
    const element = project.elements[elementId];
    if (!element) return;
    guard.add(elementId);
    ordered.push(elementId);
    for (const childId of element.childrenIds ?? []) visit(childId);
  };
  for (const rootId of project.rootElementIds ?? []) visit(rootId);
  return ordered;
}

function paintIndexMap(project: TraceProject): Map<string, number> {
  const map = new Map<string, number>();
  paintOrder(project).forEach((id, index) => map.set(id, index));
  return map;
}

/** Deepest container that holds every id (null = artboard root). */
export function commonParentId(
  project: TraceProject,
  elementIds: string[],
): string | null {
  if (elementIds.length === 0) return null;
  let candidate = project.elements[elementIds[0]]?.parentId ?? null;
  while (candidate) {
    const holdsAll = elementIds.every(
      (id) =>
        id === candidate || isElementDescendant(project, id, candidate),
    );
    if (holdsAll) return candidate;
    candidate = project.elements[candidate]?.parentId ?? null;
  }
  return null;
}

/** Sort ids by their artboard paint order (bottom to top). */
export function sortByPaintOrder(
  project: TraceProject,
  elementIds: string[],
): string[] {
  const order = paintIndexMap(project);
  return [...elementIds].sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  );
}

/**
 * Remove ids that are descendants of another selected id — grouping an
 * ancestor already brings its subtree along.
 */
export function topmostSelectedIds(
  project: TraceProject,
  elementIds: string[],
): string[] {
  const unique = [...new Set(elementIds)].filter(
    (id) => Boolean(project.elements[id]),
  );
  return unique.filter(
    (id) =>
      !unique.some(
        (other) => other !== id && isElementDescendant(project, id, other),
      ),
  );
}

/**
 * Paint-order insertion slot for a group built from `elementIds` inside
 * `parentId`. The group takes the slot of the topmost direct child.
 */
export function groupInsertionIndex(
  project: TraceProject,
  parentId: string | null,
  elementIds: string[],
): number {
  const siblings = [...siblingIds(project, parentId)];
  const direct = elementIds
    .map((id) => siblings.indexOf(id))
    .filter((index) => index >= 0);
  if (direct.length === 0) return siblings.length;
  const top = Math.max(...direct);
  const removedBelowTop = direct.filter((index) => index < top).length;
  return Math.max(0, top - removedBelowTop);
}
