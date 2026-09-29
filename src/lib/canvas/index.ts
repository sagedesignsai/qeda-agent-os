/**
 * lib/canvas/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The barrel. Everything public in the canvas module, and nothing else.
 *
 * TWO NAMING CONVENTIONS, both load-bearing:
 *
 *   1. TYPES ARE BARE, SCHEMAS CARRY A `Schema` SUFFIX. `Doc` is the document
 *      *type*; `DocSchema` is the zod validator that produces it. This matches
 *      `studio/doc.ts`, and it is also what keeps eslint's `no-redeclare`
 *      quiet — declaring `const X` and `type X` under one name trips it. A
 *      reader who has to remember which one `Doc` is has already lost.
 *
 *   2. RE-EXPORTS CREATE NO LOCAL BINDING. `export type { Doc } from './schema'`
 *      means `Doc` is not in scope *in this file* — so a barrel that also
 *      *used* `Doc` would get a type error at best and a silent `any` at worst.
 *      Everything below is a pure re-export, which is why convention 1 exists:
 *      a bare type name and a `…Schema` value name are two different export
 *      names, so nothing here is asked to be both at once.
 *
 * The export list is explicit rather than `export *` on purpose. This module is
 * imported by both the renderer and plain unit tests, and a wildcard re-export
 * silently widens the public surface every time a helper is added — which is
 * how a `style.ts` internal becomes a contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  CanvasGroup,
  CanvasNode,
  ColorRef,
  Doc,
  DocInput,
  ImageFit,
  ImageNode,
  NodeKind,
  NodeStyle,
  Page,
  PageInput,
  ShapeKind,
  ShapeNode,
  TextAlign,
  TextFit,
  TextNode,
} from './schema';

// ── Schemas (convention 1: `…Schema` is the validator) ─────────────────────
export {
  CanvasGroupSchema,
  CanvasNodeSchema,
  ColorRefSchema,
  DocSchema,
  ImageNodeSchema,
  NodeStyleSchema,
  PageSchema,
  ShapeNodeSchema,
  TextNodeSchema,
  cssColorLiteral,
  parseDoc,
  safeParseDoc,
} from './schema';

// ── Ingest ──────────────────────────────────────────────────────────────────
export { LENGTH_DP, normalizeDoc } from './normalize';

// ── Geometry (the single source of truth) ───────────────────────────────────
export {
  groupBounds,
  groupStyle,
  membersOf,
  nodeBounds,
  nodeStyle,
  num,
  ownerGroup,
  px,
  round2,
} from './style';
export type { Bounds } from './style';

// ── Emission ────────────────────────────────────────────────────────────────
export {
  ANIMATIONS,
  CSP,
  TRANSPARENT_PIXEL,
  animationStyle,
  compilePage,
  docOutline,
} from './compile';
export type { AnimationPreset, CompileOptions } from './compile';

// ── Escaping ────────────────────────────────────────────────────────────────
export { cssSafe, escapeAttr, escapeText } from './escape';

// ── Tokens ──────────────────────────────────────────────────────────────────
export {
  FONT_STACK,
  FONT_VAR,
  TOKEN_COLORS,
  TOKEN_NAMES,
  TOKEN_VALUES,
  tokenVarName,
} from './tokens';
export type { TokenName } from './tokens';

// ── Presets ─────────────────────────────────────────────────────────────────
export {
  LINK_CARD,
  PRESETS,
  PRESET_SLUGS,
  SQUARE_POST,
  STORY,
  getPreset,
} from './presets';
export type { PresetSlug } from './presets';
