/**
 * lib/trace/path/model.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, DOM-free editable model for SVG path data.
 *
 * A PathModel is a list of subpaths; every node carries its anchor plus
 * absolute cubic control points (handleIn/handleOut). Line segments are
 * the degenerate case where both handles sit on their anchors. Parsing
 * normalises every SVG command (M/L/H/V/C/S/Q/T/A/Z, absolute or
 * relative) into this model; serialising always emits absolute
 * M/L/C/Z, so Q/T/S/A round-trip as geometrically identical C/L.
 *
 * Coordinates are element-local (the space of `attributes.d`, inside the
 * element's transform group) — the editor converts to/from artboard
 * space with the gizmo geometry helpers.
 */

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathNode {
  point: PathPoint;
  handleIn: PathPoint;
  handleOut: PathPoint;
  smooth: boolean;
}

export interface PathSubpath {
  closed: boolean;
  nodes: PathNode[];
}

export interface PathModel {
  subpaths: PathSubpath[];
}

/** Element types whose geometry is an editable point list. */
export type PathEditableType = 'path' | 'polyline' | 'polygon';

export function isPathEditableType(
  type: string | undefined,
): type is PathEditableType {
  return type === 'path' || type === 'polyline' || type === 'polygon';
}

function nodeAt(point: PathPoint): PathNode {
  return {
    point: { ...point },
    handleIn: { ...point },
    handleOut: { ...point },
    smooth: false,
  };
}

function pointsEqual(a: PathPoint, b: PathPoint, eps = 0.01): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function inferSmooth(node: PathNode): boolean {
  const vin = {
    x: node.handleIn.x - node.point.x,
    y: node.handleIn.y - node.point.y,
  };
  const vout = {
    x: node.handleOut.x - node.point.x,
    y: node.handleOut.y - node.point.y,
  };
  const lenIn = Math.hypot(vin.x, vin.y);
  const lenOut = Math.hypot(vout.x, vout.y);
  if (lenIn < 0.01 || lenOut < 0.01) return false;
  const cross = vin.x * vout.y - vin.y * vout.x;
  const dot = vin.x * vout.x + vin.y * vout.y;
  const crossScale = lenIn * lenOut;
  return Math.abs(cross) / crossScale < 0.02 && dot < 0;
}

export function clonePathModel(model: PathModel): PathModel {
  return {
    subpaths: model.subpaths.map((subpath) => ({
      closed: subpath.closed,
      nodes: subpath.nodes.map((node) => ({
        point: { ...node.point },
        handleIn: { ...node.handleIn },
        handleOut: { ...node.handleOut },
        smooth: node.smooth,
      })),
    })),
  };
}

/** Total anchor count across all subpaths. */
export function countAnchors(model: PathModel): number {
  return model.subpaths.reduce(
    (total, subpath) => total + subpath.nodes.length,
    0,
  );
}

interface Token {
  command?: string;
  value?: number;
}

function tokenize(d: string): Token[] {
  const raw = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!raw) return [];
  return raw.map((part) =>
    /^[a-zA-Z]$/.test(part)
      ? { command: part }
      : { value: Number(part) },
  );
}

/**
 * Parse SVG path data into a PathModel. Unknown/unsupported commands are
 * skipped safely; arcs (A/a) become line segments between endpoints.
 */
export function parsePathData(d: string): PathModel {
  const tokens = tokenize(d ?? '');
  const model: PathModel = { subpaths: [] };
  let cursor: PathPoint = { x: 0, y: 0 };
  let subpathStart: PathPoint = { x: 0, y: 0 };
  let command = '';
  let index = 0;
  let prevControl: PathPoint | null = null;
  let prevWasCurve = false;

  const currentSubpath = (): PathSubpath | null =>
    model.subpaths[model.subpaths.length - 1] ?? null;

  const ensureSubpath = (): PathSubpath => {
    let subpath = currentSubpath();
    if (!subpath) {
      subpath = { closed: false, nodes: [] };
      model.subpaths.push(subpath);
    }
    return subpath;
  };

  const nextValue = (): number | null => {
    const token = tokens[index];
    if (!token || token.value === undefined) return null;
    index += 1;
    return token.value;
  };

  const readPoint = (relative: boolean): PathPoint | null => {
    const x = nextValue();
    const y = nextValue();
    if (x === null || y === null) return null;
    return relative
      ? { x: cursor.x + x, y: cursor.y + y }
      : { x, y };
  };

  const addNode = (point: PathPoint): PathNode => {
    const subpath = ensureSubpath();
    const node = nodeAt(point);
    subpath.nodes.push(node);
    cursor = { ...point };
    return node;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.command) {
      command = token.command;
      index += 1;
      if (command === 'Z' || command === 'z') {
        const subpath = currentSubpath();
        if (subpath) subpath.closed = true;
        cursor = { ...subpathStart };
        prevControl = null;
        prevWasCurve = false;
        command = '';
        continue;
      }
    }
    if (!command) break;
    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === 'M') {
      const point = readPoint(relative);
      if (!point) break;
      const subpath: PathSubpath = { closed: false, nodes: [] };
      model.subpaths.push(subpath);
      const node = nodeAt(point);
      subpath.nodes.push(node);
      subpathStart = { ...point };
      cursor = { ...point };
      prevControl = null;
      prevWasCurve = false;
      // Extra coordinate pairs after M are implicit L.
      command = relative ? 'l' : 'L';
      continue;
    }

    const subpath = currentSubpath();
    if (!subpath || subpath.nodes.length === 0) break;
    const prevNode = subpath.nodes[subpath.nodes.length - 1];
    const start = { ...cursor };

    if (upper === 'L') {
      const point = readPoint(relative);
      if (!point) break;
      addNode(point);
      prevControl = null;
      prevWasCurve = false;
    } else if (upper === 'H') {
      const value = nextValue();
      if (value === null) break;
      const point = { x: relative ? cursor.x + value : value, y: cursor.y };
      addNode(point);
      prevControl = null;
      prevWasCurve = false;
    } else if (upper === 'V') {
      const value = nextValue();
      if (value === null) break;
      const point = { x: cursor.x, y: relative ? cursor.y + value : value };
      addNode(point);
      prevControl = null;
      prevWasCurve = false;
    } else if (upper === 'C') {
      const c1 = readPoint(relative);
      const c2 = readPoint(relative);
      const end = readPoint(relative);
      if (!c1 || !c2 || !end) break;
      prevNode.handleOut = { ...c1 };
      const node = addNode(end);
      node.handleIn = { ...c2 };
      prevControl = { ...c2 };
      prevWasCurve = true;
    } else if (upper === 'S') {
      const c2 = readPoint(relative);
      const end = readPoint(relative);
      if (!c2 || !end) break;
      const c1 =
        prevWasCurve && prevControl
          ? {
              x: 2 * start.x - prevControl.x,
              y: 2 * start.y - prevControl.y,
            }
          : { ...start };
      prevNode.handleOut = { ...c1 };
      const node = addNode(end);
      node.handleIn = { ...c2 };
      prevControl = { ...c2 };
      prevWasCurve = true;
    } else if (upper === 'Q') {
      const control = readPoint(relative);
      const end = readPoint(relative);
      if (!control || !end) break;
      const c1 = {
        x: start.x + (2 / 3) * (control.x - start.x),
        y: start.y + (2 / 3) * (control.y - start.y),
      };
      const c2 = {
        x: end.x + (2 / 3) * (control.x - end.x),
        y: end.y + (2 / 3) * (control.y - end.y),
      };
      prevNode.handleOut = { ...c1 };
      const node = addNode(end);
      node.handleIn = { ...c2 };
      prevControl = { ...control };
      prevWasCurve = true;
    } else if (upper === 'T') {
      const end = readPoint(relative);
      if (!end) break;
      const control: PathPoint = prevControl
        ? {
            x: 2 * start.x - prevControl.x,
            y: 2 * start.y - prevControl.y,
          }
        : { ...start };
      const c1 = {
        x: start.x + (2 / 3) * (control.x - start.x),
        y: start.y + (2 / 3) * (control.y - start.y),
      };
      const c2 = {
        x: end.x + (2 / 3) * (control.x - end.x),
        y: end.y + (2 / 3) * (control.y - end.y),
      };
      prevNode.handleOut = { ...c1 };
      const node = addNode(end);
      node.handleIn = { ...c2 };
      prevControl = { ...control };
      prevWasCurve = true;
    } else if (upper === 'A') {
      // rx ry rotation large-arc sweep x y — endpoint only; the arc
      // itself is approximated as a straight segment when edited.
      nextValue();
      nextValue();
      nextValue();
      nextValue();
      nextValue();
      const end = readPoint(relative);
      if (!end) break;
      addNode(end);
      prevControl = null;
      prevWasCurve = false;
    } else {
      // Unknown command: skip one token to guarantee progress.
      index += 1;
    }
  }

  for (const subpath of model.subpaths) {
    for (const node of subpath.nodes) {
      node.smooth = inferSmooth(node);
    }
  }
  return model;
}

/** Parse a polyline/polygon `points` string into a single subpath. */
export function parsePointsString(
  points: string,
  closed: boolean,
): PathModel {
  const numbers = (points ?? '')
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));
  const nodes: PathNode[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    nodes.push(nodeAt({ x: numbers[i], y: numbers[i + 1] }));
  }
  return {
    subpaths: nodes.length > 0 ? [{ closed, nodes }] : [],
  };
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function isLineSegment(from: PathNode, to: PathNode): boolean {
  return (
    pointsEqual(from.handleOut, from.point) &&
    pointsEqual(to.handleIn, to.point)
  );
}

/** Serialise a PathModel back to absolute SVG path data. */
export function serializePathData(model: PathModel): string {
  const parts: string[] = [];
  for (const subpath of model.subpaths) {
    if (subpath.nodes.length === 0) continue;
    const first = subpath.nodes[0];
    parts.push(
      `M ${formatNumber(first.point.x)} ${formatNumber(first.point.y)}`,
    );
    for (let i = 1; i < subpath.nodes.length; i += 1) {
      const prev = subpath.nodes[i - 1];
      const curr = subpath.nodes[i];
      if (isLineSegment(prev, curr)) {
        parts.push(
          `L ${formatNumber(curr.point.x)} ${formatNumber(curr.point.y)}`,
        );
      } else {
        parts.push(
          `C ${formatNumber(prev.handleOut.x)} ${formatNumber(
            prev.handleOut.y,
          )} ${formatNumber(curr.handleIn.x)} ${formatNumber(
            curr.handleIn.y,
          )} ${formatNumber(curr.point.x)} ${formatNumber(curr.point.y)}`,
        );
      }
    }
    if (subpath.closed && subpath.nodes.length > 1) {
      const last = subpath.nodes[subpath.nodes.length - 1];
      const firstNode = subpath.nodes[0];
      if (!isLineSegment(last, firstNode)) {
        parts.push(
          `C ${formatNumber(last.handleOut.x)} ${formatNumber(
            last.handleOut.y,
          )} ${formatNumber(firstNode.handleIn.x)} ${formatNumber(
            firstNode.handleIn.y,
          )} ${formatNumber(firstNode.point.x)} ${formatNumber(
            firstNode.point.y,
          )} Z`,
        );
      } else {
        parts.push('Z');
      }
    }
  }
  return parts.join(' ');
}

/** Serialise only anchor points (polyline/polygon `points` string). */
export function serializePointsString(model: PathModel): string {
  const subpath = model.subpaths[0];
  if (!subpath) return '';
  return subpath.nodes
    .map(
      (node) =>
        `${formatNumber(node.point.x)},${formatNumber(node.point.y)}`,
    )
    .join(' ');
}

/** True when the segment between two nodes renders as a straight line. */
export function isCurveSegment(from: PathNode, to: PathNode): boolean {
  return !isLineSegment(from, to);
}
