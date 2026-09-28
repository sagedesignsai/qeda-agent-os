/**
 * lib/canvas/style.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SINGLE SOURCE OF TRUTH FOR GEOMETRY. One function, two consumers: the
 * HTML emitter in `compile.ts` (which stringifies the result into a `style`
 * attribute) and the future React canvas (which passes it straight to `style`).
 *
 * That is the whole reason this module exists. If the editor drew nodes with
 * one geometry function and exported them with another, the two would drift —
 * and the drift would be invisible in review, absent from the diff, and baked
 * into every exported artefact. Structurally impossible beats reviewed.
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────
 * A text node with no `h` emits NO `height` property. Not `height:auto`, not a
 * cached measurement, not a "close enough" estimate — the key is simply absent,
 * and the engine lays the box out naturally.
 *
 * The moment a measured or cached height leaks in here, `h` stops meaning
 * "what the author asked for" and starts meaning "what the last render
 * happened to produce" — and the document stops being intent, becomes a
 * picture of a render, and stops being diffable, mergeable and LLM-editable.
 * That is a worse bug than a wrong pixel, because it is invisible until someone
 * reopens a document on a machine with different fonts. Two tests pin it: one
 * asserts the key is absent for an un-heighted text node, the other asserts a
 * text node with `h: 80` emits exactly `height:80px`.
 *
 * ── OTHER INVARIANTS ────────────────────────────────────────────────────────
 *   • Every length is rounded to 2dp HERE, at the boundary. Rounding earlier
 *     would let accumulation drift; rounding later would let the emitter and
 *     React disagree.
 *   • Key ORDER is fixed and meaningful, because the emitter stringifies this
 *     object and the output must be byte-stable across runs. Do not reorder
 *     without accepting a diff to every saved export.
 *   • Rotation and scale are about the node's own centre, which is the CSS
 *     default for `transform-origin`. It is left implicit on purpose: stating
 *     it here would be stating it in two renderers' worth of output for no
 *     behavioural difference, and an implicit default cannot drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CanvasGroup, CanvasNode, Page } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Round a number for output. 2dp: finer than a screen pixel, coarser than FP noise. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A number → a CSS px token, always at least one decimal-free integer form.
 * `-0` is normalised to `0` so that the sign of a zero can never change the
 * output bytes between two runs.
 */
export function px(n: number): string {
  const r = round2(n);
  return `${r === 0 ? 0 : r}px`;
}

/** Round for stable output inside a larger CSS value (weights, ratios, degrees). */
export function num(n: number): string {
  const r = round2(n);
  return String(r === 0 ? 0 : r);
}

// ─────────────────────────────────────────────────────────────────────────────
// Node geometry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The transform for a node, or `undefined` when it has none. Rotation and
 * scale compose in that order, which is the order the CSS `transform` list
 * applies them and therefore the only order that can be reversed.
 */
function transformOf(
  rotate: number | undefined,
  scale: number | undefined,
): string | undefined {
  const parts: string[] = [];
  if (rotate !== undefined && rotate !== 0) parts.push(`rotate(${num(rotate)}deg)`);
  if (scale !== undefined && scale !== 1) parts.push(`scale(${num(scale)})`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Build the inline style object for one node.
 *
 * Returned as a plain `Record<string, string>` with `undefined` values simply
 * absent — that is the shape both consumers want (CSS-in-JS, `Object.entries`)
 * and it keeps the conditional branches readable as a single array literal.
 */
export function nodeStyle(node: CanvasNode): Record<string, string> {
  const d: Record<string, string | undefined> = {
    position: 'absolute',
    left: px(node.x),
    top: px(node.y),
    width: px(node.w),
    // ── THE RULE. Present ⟺ the author asked for it. Never otherwise. ────────
    height: node.h === undefined ? undefined : px(node.h),
    'box-sizing': 'border-box',
    transform: transformOf(node.rotate),
    opacity: node.opacity === undefined ? undefined : num(node.opacity),
  };

  switch (node.kind) {
    case 'text':
      d['margin'] = '0';
      d['font-family'] = 'var(--canvas-font)';
      d['font-size'] = px(node.fontSize);
      d['font-weight'] = num(node.fontWeight);
      d['color'] = node.color;
      d['line-height'] =
        node.lineHeight === undefined ? undefined : num(node.lineHeight);
      d['text-align'] = node.align;
      // Honour the author's newlines: without this every authored line break
      // silently becomes a space, which is a data-loss bug, not a style choice.
      d['white-space'] = 'pre-wrap';
      d['overflow'] =
        node.fit === undefined || node.fit === 'none' ? undefined : 'hidden';
      break;

    case 'shape':
      d['display'] = 'block';
      d['background'] = node.fill;
      // An ellipse is fully round regardless of the requested radius, so the
      // shared `style.radius` does not apply to it. A `line` is square by
      // definition; its box (usually 0 in one axis) IS the line.
      d['border-radius'] =
        node.shape === 'ellipse'
          ? '9999px'
          : node.shape === 'line'
            ? '0'
            : node.style?.radius === undefined
              ? '0'
              : px(node.style.radius);
      break;

    case 'image':
      d['display'] = 'block';
      d['object-fit'] = node.fit ?? 'cover';
      d['border-radius'] =
        node.style?.radius === undefined ? undefined : px(node.style.radius);
      break;
  }

  // Shared paint. `radius` is applied per-kind above because the two
  // non-rectangular kinds override it; here only the rest is applied.
  if (node.style) {
    if (node.kind !== 'shape' && node.style.radius !== undefined) {
      d['border-radius'] = px(node.style.radius);
    }
    if (node.style.stroke !== undefined) {
      d['border'] = `${px(node.style.strokeWidth ?? 1)} solid ${node.style.stroke}`;
    }
    if (node.style.shadow !== undefined) {
      d['box-shadow'] = node.style.shadow;
    }
  }

  // Drop the absent keys. A `Record<string, string>` with an explicit
  // `undefined` in it stringifies as `undefined` in a template literal, which
  // is precisely the class of bug the `Object.entries` filter below prevents.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group geometry (derived, never stored)
// ─────────────────────────────────────────────────────────────────────────────

/** An axis-aligned rectangle in page coordinates. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The rotation/scale centre. Derived like the rest, and for the same reason. */
  cx: number;
  cy: number;
}

/**
 * The bounds of a single node, WITH its own rotation applied.
 *
 * Rotation about the centre is a rigid motion, so the axis-aligned bounds of a
 * rotated box are the AABB of its four rotated corners — cheap to compute and
 * exact, which matters because the group's centre is derived from these and a
 * group's rotation pivots on it. Ignoring member rotation would put the pivot
 * visibly off-centre for any group containing a tilted element.
 */
export function nodeBounds(node: CanvasNode): Bounds {
  const w = node.w;
  const h = node.h ?? 0;
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  if (!node.rotate) return { x: node.x, y: node.y, w, h, cx, cy };

  const a = (node.rotate * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corners: Array<[number, number]> = [
    [node.x, node.y],
    [node.x + w, node.y],
    [node.x + w, node.y + h],
    [node.x, node.y + h],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px0, py0] of corners) {
    const dx = px0 - cx;
    const dy = py0 - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * The union of a group's member bounds, or `null` for an empty group.
 *
 * `members` is passed in rather than looked up from the page so that callers
 * stay in control of membership resolution (the emitter honours "first group
 * wins" when a node is listed twice; that rule belongs to the caller, not
 * here). Purely derived — this value is never written back to a document.
 */
export function groupBounds(
  members: readonly CanvasNode[],
): Bounds | null {
  if (members.length === 0) return null;
  let b = nodeBounds(members[0] as CanvasNode);
  for (let i = 1; i < members.length; i += 1) {
    const n = nodeBounds(members[i] as CanvasNode);
    const x0 = Math.min(b.x, n.x);
    const y0 = Math.min(b.y, n.y);
    const x1 = Math.max(b.x + b.w, n.x + n.w);
    const y1 = Math.max(b.y + b.h, n.y + n.h);
    b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  return b;
}

/**
 * Resolve a node id to the group that owns it. First match wins.
 *
 * The schema permits a node id to appear in more than one group's `nodeIds` —
 * forbidding it would mean a uniqueness check across the whole page, and this
 * model is a flat list precisely so that no such global invariant is needed.
 * So the tie is broken deterministically here, once, instead of being undefined
 * at every call site downstream.
 */
export function ownerGroup(
  groups: readonly CanvasGroup[],
  nodeId: string,
): CanvasGroup | undefined {
  return groups.find((g) => g.nodeIds?.includes(nodeId));
}

/**
 * The style for the wrapper element a rotated/scaled group is rendered inside.
 *
 * The wrapper is a *pure transform container*: it covers the page, it does not
 * box anything, and it does NOT re-coordinate its children. Members keep their
 * page-absolute `left`/`top`, and the wrapper rotates the plane about the
 * group's derived centre via `transform-origin`. That is what lets a group have
 * no stored box while still pivoting on the right point — and it means the
 * emitter adds no geometry of its own (see `compile.ts`).
 */
export function groupStyle(
  pageWidth: number,
  pageHeight: number,
  group: CanvasGroup,
  bounds: Bounds,
): Record<string, string> {
  const d: Record<string, string | undefined> = {
    position: 'absolute',
    left: '0',
    top: '0',
    width: px(pageWidth),
    height: px(pageHeight),
    'box-sizing': 'border-box',
    // The one derived value that reaches the DOM. Expressed in px against the
    // wrapper's own box, which is the page — so it is the page-space centre.
    'transform-origin': `${px(bounds.cx)} ${px(bounds.cy)}`,
    transform: transformOf(group.rotate, group.scale),
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** The nodes a page assigns to a group, in paint order. */
export function membersOf(page: Page, group: CanvasGroup): CanvasNode[] {
  return page.nodes.filter((n) => ownerGroup(page.groups, n.id) === group);
}
