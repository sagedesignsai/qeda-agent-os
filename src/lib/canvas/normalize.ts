/**
 * lib/canvas/normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The ingest normalizer: one chokepoint between the messy outside world and
 * the clean document model.
 *
 * WHY NORMALIZE AT ALL, RATHER THAN DEFENDING DOWNSTREAM. Documents enter from
 * an LLM, from an import, from a future drag-and-drop editor, and from the
 * database. Each emits `"12"` where a number belongs, `opacity: 4`, a
 * `rotate: NaN` from a division by zero, and a node with no id. Every one of
 * those must be dealt with EXACTLY ONCE, at the boundary. The alternative —
 * a `Number()` here and a clamp there — is how a renderer ends up with
 * geometry nobody can explain and a `NaN` in a `transform`.
 *
 * THE NaN/INFINITY DECISION: **COERCE-AND-FAIL-LOUDLY.**
 * A non-finite number is not a value with a bad rendering; it is a bug in the
 * producer, and silently substituting `0` converts a loud, reproducible failure
 * into a quiet, permanent one. Worse, `0` is a *valid* position — the
 * substitution would be indistinguishable from a correct document. So a
 * non-finite length aborts the whole normalization with a path-qualified
 * message, rather than being repaired. Out-of-range-but-finite values (the
 * `opacity: 4` case) are the opposite: clamped, because the intent is obvious
 * and the author's work is worth more than their arithmetic.
 *
 * DETERMINISM. `normalizeDoc` assigns missing ids with `nanoid`, so the *same*
 * input normalized twice yields different ids. That is intentional and is why
 * `compilePage`'s determinism guarantee is stated over a `Doc` (already
 * normalized) rather than over raw input. Normalization is not a pure function
 * of its input; everything after it is.
 *
 * nanoid is ESM-only and is already mapped to a deterministic mock for jest
 * (`jest.config.js` → `^nanoid$` → `.erb/mocks/nanoidMock.js`), so the plain
 * `import { nanoid } from 'nanoid'` used in `src/hooks/use-documents.ts` is the
 * established pattern and is what is used here. No new import style introduced.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';

import {
  type CanvasGroup,
  type CanvasNode,
  type Doc,
  type DocInput,
  type Page,
} from './schema';

/** Every emitted length is rounded to this many decimal places. */
export const LENGTH_DP = 2;

function round(n: number): number {
  const f = 10 ** LENGTH_DP;
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r; // normalise -0
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Coerce an emitted length to a finite number, rounded to `LENGTH_DP`.
 * Throws on a non-finite result — see the header's coerce-and-fail-loudly note.
 */
function len(value: unknown, path: string): number {
  const n = toNumber(value, path);
  if (!Number.isFinite(n)) {
    throw new Error(
      `canvas: non-finite length at ${path} (got ${String(value)}). Refusing to substitute — a non-finite number is a producer bug, not a value to round.`,
    );
  }
  return round(n);
}

/** Coerce a numeric string / number to a finite number, without rounding. */
function toNumber(value: unknown, path: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return Number.NaN;
    return Number(trimmed);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new Error(`canvas: expected a number at ${path}, got ${typeof value}`);
}

/** A ratio (opacity, scale): finite, clamped, rounded. */
function ratio(value: unknown, path: string, lo: number, hi: number): number {
  const n = toNumber(value, path);
  if (!Number.isFinite(n)) {
    throw new Error(
      `canvas: non-finite number at ${path} (got ${String(value)})`,
    );
  }
  return round(clamp(n, lo, hi));
}

/** A plain optional number: rounded, not clamped. */
function optLen(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return len(value, path);
}

/** A plain required number: rounded. */
function reqLen(value: unknown, path: string): number {
  return len(value, path);
}

/** An optional string, trimmed of nothing but rejected if not a string. */
function optStr(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(
      `canvas: expected a string at ${path}, got ${typeof value}`,
    );
  }
  return value;
}

function reqStr(value: unknown, path: string): string {
  const s = optStr(value, path);
  if (s === undefined) throw new Error(`canvas: missing string at ${path}`);
  return s;
}

function optBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

/**
 * Narrow an optional string to one of a closed set. An unrecognised value is
 * DROPPED (→ `undefined` → the schema's default), not passed through: an
 * invented enum member is a producer bug, but unlike a non-finite number it
 * has an unambiguous fallback, and losing the rest of the document over it
 * would be the worse trade.
 */
function optEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T | undefined {
  const s = optStr(value, path);
  if (s === undefined) return undefined;
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
const TEXT_FITS = ['none', 'shrink', 'clip'] as const;
const SHAPES = ['rect', 'ellipse', 'line'] as const;
const IMAGE_FITS = ['cover', 'contain'] as const;

/** Assign a stable id, reusing a supplied one and minting a new one otherwise. */
function stableId(value: unknown): string {
  if (typeof value === 'string' && value.length > 0 && value.length <= 64) {
    return value;
  }
  return nanoid();
}

function normalizeGroup(g: unknown, index: number): CanvasGroup {
  const path = `groups[${index}]`;
  const raw = (g ?? {}) as Record<string, unknown>;
  return {
    id: stableId(raw['id']),
    label: optStr(raw['label'], `${path}.label`),
    nodeIds: Array.isArray(raw['nodeIds'])
      ? raw['nodeIds'].map((v, i) => reqStr(v, `${path}.nodeIds[${i}]`))
      : undefined,
    rotate: optLen(raw['rotate'], `${path}.rotate`),
    scale: optLen(raw['scale'], `${path}.scale`),
  };
}

function normalizeNode(n: unknown, index: number): CanvasNode {
  const path = `nodes[${index}]`;
  const raw = (n ?? {}) as Record<string, unknown>;
  const kind = raw['kind'];
  if (kind !== 'text' && kind !== 'shape' && kind !== 'image') {
    throw new Error(
      `canvas: unknown node kind at ${path} (got ${JSON.stringify(kind)})`,
    );
  }

  // Fields common to every kind. Note `h` is copied through UNCHANGED in
  // intent: absent stays absent. Rounding never conjures a height.
  const base = {
    id: stableId(raw['id']),
    name: optStr(raw['name'], `${path}.name`),
    x: reqLen(raw['x'], `${path}.x`),
    y: reqLen(raw['y'], `${path}.y`),
    w: Math.max(0, reqLen(raw['w'], `${path}.w`)),
    rotate: optLen(raw['rotate'], `${path}.rotate`),
    opacity:
      raw['opacity'] === undefined || raw['opacity'] === null
        ? undefined
        : ratio(raw['opacity'], `${path}.opacity`, 0, 1),
    locked: optBool(raw['locked'], false),
    visible: optBool(raw['visible'], true),
  };

  const style = raw['style'] as Record<string, unknown> | undefined;

  if (kind === 'text') {
    return {
      ...base,
      kind: 'text',
      content: reqStr(raw['content'], `${path}.content`),
      fontSize: len(raw['fontSize'], `${path}.fontSize`),
      fontWeight: Math.round(
        clamp(toNumber(raw['fontWeight'], `${path}.fontWeight`), 100, 900),
      ),
      color: reqStr(raw['color'], `${path}.color`),
      align: optEnum(raw['align'], TEXT_ALIGNS, `${path}.align`),
      lineHeight: optLen(raw['lineHeight'], `${path}.lineHeight`),
      fit: optEnum(raw['fit'], TEXT_FITS, `${path}.fit`),
      // A text node's `h` is OPTIONAL and, when absent, MUST stay absent.
      h: optLen(raw['h'], `${path}.h`),
      style: normalizeStyle(style, path),
    };
  }

  if (kind === 'shape') {
    const h = raw['h'];
    if (h === undefined || h === null) {
      throw new Error(
        `canvas: shape node at ${path} is missing 'h'. A shape has no content-driven size, so 'h' is required — use a text node if the box should grow.`,
      );
    }
    return {
      ...base,
      kind: 'shape',
      shape: optEnum(raw['shape'], SHAPES, `${path}.shape`) ?? 'rect',
      fill: reqStr(raw['fill'], `${path}.fill`),
      h: Math.max(0, len(h, `${path}.h`)),
      style: normalizeStyle(style, path),
    };
  }

  const h = raw['h'];
  if (h === undefined || h === null) {
    throw new Error(`canvas: image node at ${path} is missing 'h'`);
  }
  return {
    ...base,
    kind: 'image',
    src: {
      kind: 'asset',
      assetId: reqStr(srcAssetId(raw['src']), `${path}.src`),
    },
    fit: optEnum(raw['fit'], IMAGE_FITS, `${path}.fit`),
    h: Math.max(0, len(h, `${path}.h`)),
    style: normalizeStyle(style, path),
  };
}

function srcAssetId(src: unknown): unknown {
  if (src && typeof src === 'object')
    return (src as Record<string, unknown>)['assetId'];
  return undefined;
}

function normalizeStyle(
  style: Record<string, unknown> | undefined,
  path: string,
): CanvasNode['style'] {
  if (!style) return undefined;
  return {
    radius: optLen(style['radius'], `${path}.style.radius`),
    stroke: optStr(style['stroke'], `${path}.style.stroke`),
    strokeWidth: optLen(style['strokeWidth'], `${path}.style.strokeWidth`),
    shadow: optStr(style['shadow'], `${path}.style.shadow`),
  };
}

function normalizePage(p: unknown, index: number): Page {
  const path = `pages[${index}]`;
  const raw = (p ?? {}) as Record<string, unknown>;
  const nodes = Array.isArray(raw['nodes']) ? raw['nodes'] : [];
  const groups = Array.isArray(raw['groups']) ? raw['groups'] : [];
  return {
    id: stableId(raw['id']),
    name: optStr(raw['name'], `${path}.name`),
    background: optStr(raw['background'], `${path}.background`),
    nodes: nodes.map(normalizeNode),
    groups: groups.map(normalizeGroup),
  };
}

/**
 * Normalize an untrusted document into a `Doc`.
 *
 * Returns a NEW value; the input is never mutated. Throws on the first
 * non-finite number or structurally impossible node (see the header). Call
 * `normalizeDoc` inside a try/catch at any untrusted boundary, then hand the
 * result to `Doc.parse` for the full structural check — normalization fixes
 * *values*, the schema enforces *shape*.
 */
export function normalizeDoc(input: DocInput | unknown): Doc {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    id: stableId(raw['id']),
    name: reqStr(raw['name'], 'name'),
    width: Math.max(1, len(raw['width'], 'width')),
    height: Math.max(1, len(raw['height'], 'height')),
    background: reqStr(raw['background'], 'background'),
    pages: (Array.isArray(raw['pages']) ? raw['pages'] : []).map(normalizePage),
  };
}
