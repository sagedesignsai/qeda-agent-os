/**
 * lib/trace/path/edit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure edit operations on a PathModel: anchor/handle moves, segment
 * splits (insert), anchor deletion and smooth/corner conversion.
 * Every operation clones — the committed model is never mutated, so a
 * drag can preview freely and commit once.
 */

import {
  clonePathModel,
  type PathModel,
  type PathNode,
  type PathPoint,
} from './model';

export interface AnchorRef {
  subpath: number;
  index: number;
}

function getNode(
  model: PathModel,
  ref: AnchorRef,
): PathNode | null {
  return model.subpaths[ref.subpath]?.nodes[ref.index] ?? null;
}

function lerp(a: PathPoint, b: PathPoint, t: number): PathPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Point on a cubic Bézier segment at parameter t (0..1). */
export function cubicPointAt(
  p0: PathPoint,
  c1: PathPoint,
  c2: PathPoint,
  p1: PathPoint,
  t: number,
): PathPoint {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** Segment endpoints/control points for nodes `from -> to`. */
export function segmentPoints(from: PathNode, to: PathNode) {
  return {
    p0: from.point,
    c1: from.handleOut,
    c2: to.handleIn,
    p1: to.point,
  };
}

/**
 * Nearest sampled point on a segment to `target` (32 samples). Good
 * enough for click-to-insert hit testing at editor zoom levels.
 */
export function nearestPointOnSegment(
  from: PathNode,
  to: PathNode,
  target: PathPoint,
  samples = 32,
): { t: number; point: PathPoint; distance: number } {
  const { p0, c1, c2, p1 } = segmentPoints(from, to);
  let bestT = 0;
  let bestPoint = p0;
  let bestDistance = Infinity;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const point = cubicPointAt(p0, c1, c2, p1, t);
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
      bestPoint = point;
    }
  }
  return { t: bestT, point: bestPoint, distance: bestDistance };
}

/** Move an anchor; its handles travel with it so the shape is preserved. */
export function moveAnchor(
  model: PathModel,
  ref: AnchorRef,
  to: PathPoint,
): PathModel {
  const next = clonePathModel(model);
  const node = getNode(next, ref);
  if (!node) return model;
  const dx = to.x - node.point.x;
  const dy = to.y - node.point.y;
  node.point = { ...to };
  node.handleIn = { x: node.handleIn.x + dx, y: node.handleIn.y + dy };
  node.handleOut = { x: node.handleOut.x + dx, y: node.handleOut.y + dy };
  return next;
}

/**
 * Move one Bézier handle. Smooth nodes mirror the opposite handle
 * (same distance, reversed direction) unless `breakSmooth` (Alt).
 */
export function moveHandle(
  model: PathModel,
  ref: AnchorRef,
  which: 'in' | 'out',
  to: PathPoint,
  options: { breakSmooth?: boolean } = {},
): PathModel {
  const next = clonePathModel(model);
  const node = getNode(next, ref);
  if (!node) return model;
  const key = which === 'in' ? 'handleIn' : 'handleOut';
  const otherKey = which === 'in' ? 'handleOut' : 'handleIn';
  node[key] = { ...to };
  if (node.smooth && !options.breakSmooth) {
    node[otherKey] = {
      x: node.point.x - (to.x - node.point.x),
      y: node.point.y - (to.y - node.point.y),
    };
  } else if (options.breakSmooth) {
    node.smooth = false;
  }
  return next;
}

/**
 * Insert an anchor on segment `segmentIndex` (the segment starting at
 * that node; for a closed subpath the last index wraps to the first
 * node). The cubic is split with de Casteljau at `t`, so the inserted
 * point lies exactly on the original curve and the shape is unchanged.
 * Returns the ref of the inserted anchor, or null when it cannot split.
 */
export function addPointOnSegment(
  model: PathModel,
  subpathIndex: number,
  segmentIndex: number,
  t: number,
): { model: PathModel; ref: AnchorRef } | null {
  const subpath = model.subpaths[subpathIndex];
  if (!subpath || subpath.nodes.length < 2) return null;
  if (t <= 0.001 || t >= 0.999) return null;
  const count = subpath.nodes.length;
  const wraps =
    subpath.closed && segmentIndex === count - 1;
  const fromIndex = wraps ? count - 1 : segmentIndex;
  const toIndex = wraps ? 0 : segmentIndex + 1;
  if (fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count)
    return null;
  if (!wraps && toIndex !== fromIndex + 1) return null;

  const next = clonePathModel(model);
  const nextSubpath = next.subpaths[subpathIndex];
  const from = nextSubpath.nodes[fromIndex];
  const to = nextSubpath.nodes[toIndex];
  const { p0, c1, c2, p1 } = segmentPoints(from, to);

  // De Casteljau split at t.
  const a = lerp(p0, c1, t);
  const b = lerp(c1, c2, t);
  const c = lerp(c2, p1, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const point = lerp(d, e, t);

  const wasCurve =
    Math.hypot(c1.x - p0.x, c1.y - p0.y) > 0.01 ||
    Math.hypot(c2.x - p1.x, c2.y - p1.y) > 0.01;

  from.handleOut = { ...a };
  to.handleIn = { ...c };
  const inserted: PathNode = {
    point,
    handleIn: { ...d },
    handleOut: { ...e },
    smooth: wasCurve,
  };

  if (wraps) {
    // Segment runs last -> first; appending puts the new anchor between
    // them in array order while the closed edge still joins last->first
    // through the appended node.
    nextSubpath.nodes.push(inserted);
    return {
      model: next,
      ref: { subpath: subpathIndex, index: nextSubpath.nodes.length - 1 },
    };
  }
  nextSubpath.nodes.splice(toIndex, 0, inserted);
  return { model: next, ref: { subpath: subpathIndex, index: toIndex } };
}

/**
 * Delete an anchor. Refuses when the subpath would drop below two
 * anchors. Neighbours are straightened (handles reset to anchors), so
 * the join renders as a line.
 */
export function deleteAnchor(
  model: PathModel,
  ref: AnchorRef,
): PathModel {
  const subpath = model.subpaths[ref.subpath];
  if (!subpath || subpath.nodes.length <= 2) return model;
  if (ref.index < 0 || ref.index >= subpath.nodes.length) return model;
  const next = clonePathModel(model);
  const nextSubpath = next.subpaths[ref.subpath];
  nextSubpath.nodes.splice(ref.index, 1);
  const prev = nextSubpath.nodes[ref.index - 1];
  const curr = nextSubpath.nodes[ref.index];
  if (prev) prev.handleOut = { ...prev.point };
  if (curr) curr.handleIn = { ...curr.point };
  return next;
}

/** Toggle smooth/corner on an anchor (handles themselves are kept). */
export function toggleSmooth(
  model: PathModel,
  ref: AnchorRef,
): PathModel {
  const next = clonePathModel(model);
  const node = getNode(next, ref);
  if (!node) return model;
  node.smooth = !node.smooth;
  return next;
}
