/**
 * lib/canvas/schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The frozen document model. Everything downstream — the normalizer, the HTML
 * emitter, and (in a later phase) the React canvas — reads this and only this.
 *
 * WHAT THIS MODEL IS. A document is a plain JSON value. It is authored by
 * humans *and* by an LLM, diffed in git, stored in SQLite, and compiled to
 * HTML. It is therefore *intent*, not measurement, and never a picture of a
 * render. The single most important consequence: **an absent value means "do
 * not constrain this", never "this is zero"** — see `h` on a text node.
 *
 * THE FIVE DECISIONS THIS FILE ENCODES (rationale in `README.md`; summarised
 * here because the next person to want to "just add a z" needs to see them at
 * the point of change):
 *
 *  1. NO `z` FIELD. Array order IS the z-order; later paints on top.
 *     Bring-to-front is `splice`, nothing else. This buys the elimination of
 *     ties, gaps, reindex-on-delete and `NaN` sentinels for free — a z field
 *     is a second ordering system that can always disagree with the first.
 *
 *  2. `h` IS REQUIRED FOR `shape` AND `image`, OPTIONAL FOR `text`. A shape or
 *     an image has no content-driven size: no `h` means a broken layout. A
 *     text node without `h` means "as tall as the content needs" — a statement
 *     about intent that no renderer can contradict. That is why nothing
 *     downstream may ever write a measured height back into a document.
 *
 *  3. `Group` HAS NO `x`/`y`/`w`/`h`. Its box is DERIVED from member nodes
 *     (`groupBounds` in `style.ts`). Storing it would create a second source of
 *     truth for a derived value, and the group→node migration (P4) would have
 *     to reconcile disagreements between the two. So the schema is `.strict()`
 *     and actively REJECTS those keys — a reservation, not an omission.
 *
 *  4. EXACTLY THREE KINDS, and the union is closed. A new kind is a
 *     deliberate schema change with a migration, not an additive edit.
 *
 *  5. FILL/COLOUR STAY KIND-SPECIFIC. `fill` is a shape's background, `color`
 *     is a text node's foreground, and an image has neither. They are the same
 *     *type* and deliberately not the same *field*: merging them would let an
 *     image "have a fill", which is meaningless and would then need a
 *     migration to remove. Only genuinely-shared concepts — `radius`, `stroke`,
 *     `strokeWidth`, `shadow`, which really are identical on all three kinds —
 *     live in the shared `style` object.
 *
 * ZOD DISCIPLINE (learned the hard way in `studio/`, which carries 13 type
 * errors from doing it the other way):
 *   • NEVER annotate a schema with its own type. `const N: z.ZodType<CanvasNode>`
 *     is a *wider* contract than any concrete schema can satisfy in zod 4,
 *     because `ZodType` now carries an invariant `Internals` parameter — and
 *     that wider contract is precisely what breaks `discriminatedUnion`. So:
 *     `export const N = …; export type N = z.infer<typeof N>;`
 *     Types are derived DOWNWARD from schemas, never pushed upward onto them.
 *   • There is NO recursion in this model (flat `nodes[]`; `groups[]` holds no
 *     nodes), so there should be no `z.lazy` anywhere. If you are reaching for
 *     one, you are about to reintroduce the cycles the flat design avoids.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';

import { TOKEN_NAMES, tokenVarName } from './tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Scalars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A finite number. `z.number()` in zod 4 already rejects `NaN`, `Infinity` and
 * `-Infinity` (verified against 4.6.5), and — importantly — does NOT coerce
 * numeric strings. So this schema is also the thing that makes the
 * "rejects NaN/Infinity" guarantee true; `normalize.ts` is where coercion is
 * allowed to happen, and only on the ingest path.
 */
const finite = () => z.number();

/**
 * A CSS colour *literal*. Deliberately an allow-list, not a deny-list.
 *
 * A naive "it's a string, trust it" colour is an injection surface: the value
 * ends up inside a `style="…"` attribute and inside a `<style>` block, where
 * `url(…); }` is enough to add a rule. The regex admits exactly the forms the
 * presets and the editor emit — hex, a bare named colour, and the
 * `rgb()/rgba()/hsl()/hsla()` functional forms — and nothing else. In
 * particular `:` is excluded, which is what makes `url(http:…)` unrepresentable.
 */
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const NAMED = /^[a-zA-Z]{3,20}$/;
const FUNCTIONAL = /^(?:rgba?|hsla?)\([0-9a-zA-Z.,%/\s-]+\)$/;

export const cssColorLiteral = z
  .string()
  .max(64)
  .refine(
    (v) => HEX.test(v) || NAMED.test(v) || FUNCTIONAL.test(v),
    'must be a CSS colour literal (hex, named, or rgb()/rgba()/hsl()/hsla())',
  );

/**
 * The one colour type a document uses: a token name, or a literal.
 *
 * A token name is validated against the closed `TOKEN_NAMES` list — that is
 * what makes "rejects an unknown token" true — and is compiled to
 * `var(--token)`, so the output side of this union is a plain CSS colour string
 * and `style.ts` never has to branch on colour provenance.
 *
 * The token branch is tried FIRST on purpose. A bare named colour and a token
 * name overlap syntactically (`accent` matches `[a-zA-Z]{3,20}`), and token
 * names are the semantically richer reading. The collision is harmless: none of
 * the token names is a real CSS colour keyword, so a literal can never be
 * silently reinterpreted.
 */
export const ColorRefSchema = z
  .union([
    z.enum(TOKEN_NAMES).transform((name) => `var(${tokenVarName(name)})`),
    cssColorLiteral,
  ])
  .describe(
    'a semantic token name, or a CSS colour literal; compiles to a CSS colour',
  );

export type ColorRef = z.infer<typeof ColorRefSchema>;

/**
 * A CSS `box-shadow` shorthand, validated by allow-list for the same reason as
 * `cssColorLiteral`: it lands in a `style` attribute. Parentheses, commas and
 * `/` ARE allowed — `rgb(0 0 0 / 40%)` is the ordinary way to write a
 * translucent shadow. What is excluded is everything that could end a
 * declaration or start a URL: `:`, `;`, quotes, angle brackets and backslash.
 */
const SHADOW = /^[a-zA-Z0-9 ,.%#()/-]+$/;

export const NodeStyleSchema = z
  .object({
    /** Corner radius in px. Ignored on `ellipse`, which is always fully round. */
    radius: z.number().gte(0).finite().optional(),
    /** Outline colour. Same rules as `ColorRef`. */
    stroke: ColorRefSchema.optional(),
    /** Outline width in px. Only meaningful alongside `stroke`. */
    strokeWidth: z.number().gte(0).max(512).optional(),
    /** CSS `box-shadow` shorthand, allow-listed by `SHADOW`. */
    shadow: z.string().max(160).regex(SHADOW).optional(),
  })
  .strict()
  .describe('genuinely shared paint; fill/colour stay kind-specific');

export type NodeStyle = z.infer<typeof NodeStyleSchema>;

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type TextFit = 'none' | 'shrink' | 'clip';
export type ShapeKind = 'rect' | 'ellipse' | 'line';
export type ImageFit = 'cover' | 'contain';
export type NodeKind = 'text' | 'shape' | 'image';

// ─────────────────────────────────────────────────────────────────────────────
// Nodes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stable identity. Selection, undo remapping and the layer panel all key off
 * it, which is why an array index is never an acceptable substitute: a splice
 * at the front of the array would silently re-target the user's selection.
 * Length is capped so a runaway LLM cannot bloat every row in the database.
 */
const id = () => z.string().min(1).max(64);

/** The fields every node has, whatever its kind. */
const nodeBase = z.object({
  id: id(),
  /** Author-facing label. Purely informational; never rendered. */
  name: z.string().max(120).optional(),

  // ── Geometry ──────────────────────────────────────────────────────────────
  /** Offset from the page's left edge, in px. May be negative (off-page). */
  x: finite(),
  /** Offset from the page's top edge, in px. May be negative (off-page). */
  y: finite(),
  /** Width in px. `gte(0)`, not `positive`: a `line` is legitimately 0 tall. */
  w: z.number().gte(0).finite(),
  /**
   * Height in px. REQUIRED for `shape`/`image`, OPTIONAL for `text` — see
   * decision 2. When absent on a text node, the engine sizes the box to its
   * content and no renderer may write a measured value back here.
   */
  h: z.number().gte(0).finite().optional(),

  // ── Transform / state ─────────────────────────────────────────────────────
  /** Clockwise rotation in degrees about the node's own centre. */
  rotate: z.number().finite().optional(),
  /** Uniform opacity, 0–1. Out-of-range values are REJECTED, not clamped. */
  opacity: z.number().min(0).max(1).optional(),
  /** Editor affordance: blocks selection and drag. Never affects rendering. */
  locked: z.boolean().default(false),
  /** Hidden nodes are not emitted at all. */
  visible: z.boolean().default(true),

  style: NodeStyleSchema.optional(),
});

export const TextNodeSchema = nodeBase
  .extend({
    kind: z.literal('text'),
    /** Verbatim content. Newlines are honoured; the emitter sets `white-space`. */
    content: z.string().max(20_000),
    fontSize: z.number().gt(0).max(2000),
    /** CSS font-weight. Bounded to real weights rather than left open. */
    fontWeight: z.number().int().min(100).max(900),
    color: ColorRefSchema,
    align: z.enum(['left', 'center', 'right', 'justify']).optional(),
    /** Unitless multiplier, as in CSS. */
    lineHeight: z.number().gt(0).max(10).optional(),
    /**
     * How content behaves when the box cannot grow. `none` = overflow is
     * visible; `clip` = `overflow:hidden`; `shrink` is RESERVED — see
     * `style.ts`, which currently degrades it to clipping because true
     * shrink-to-fit needs measurement, and measurement is Phase 2's job.
     */
    fit: z.enum(['none', 'shrink', 'clip']).optional(),
  })
  .strict();

export const ShapeNodeSchema = nodeBase
  .extend({
    kind: z.literal('shape'),
    shape: z.enum(['rect', 'ellipse', 'line']),
    /** Background. Present even when fully transparent: absence is not a state. */
    fill: ColorRefSchema,
    // `h` is deliberately re-declared as REQUIRED here. `nodeBase` has it
    // optional for text; narrowing it per-kind is exactly what makes decision 2
    // enforceable rather than aspirational.
    h: z.number().gt(0).finite(),
  })
  .strict();

export const ImageNodeSchema = nodeBase
  .extend({
    kind: z.literal('image'),
    /**
     * Images are referenced, never inlined. The document stores an asset id, so
     * the bytes live in one place and a document stays small; resolution to a
     * `data:` URI happens at compile time (see `compile.ts`), which is the only
     * place a URI is allowed to exist.
     */
    src: z.object({ kind: z.literal('asset'), assetId: id() }).strict(),
    fit: z.enum(['cover', 'contain']).optional(),
    h: z.number().gt(0).finite(),
  })
  .strict();

/**
 * The closed union of everything a page can contain. `discriminatedUnion` on
 * `kind` gives a discriminated error message when a kind is wrong, and lets
 * TypeScript narrow on the same key — for free, provided no schema above is
 * annotated with its own inferred type.
 */
export const CanvasNodeSchema = z.discriminatedUnion('kind', [
  TextNodeSchema,
  ShapeNodeSchema,
  ImageNodeSchema,
]);

export type CanvasNode = z.infer<typeof CanvasNodeSchema>;
export type TextNode = z.infer<typeof TextNodeSchema>;
export type ShapeNode = z.infer<typeof ShapeNodeSchema>;
export type ImageNode = z.infer<typeof ImageNodeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A named set of nodes that rotate/scale together.
 *
 * NO `x`/`y`/`w`/`h`, AND `.strict()` SO THEY ARE REJECTED. This is the single
 * most important reservation in the file. The box is derived from the members
 * (`groupBounds`); storing it would duplicate a derived value, and the P4
 * group→node migration would inherit an unreconcilable disagreement between
 * the two copies. The test `rejects x/y/w/h on a Group` is the guard.
 */
export const CanvasGroupSchema = z
  .object({
    id: id(),
    label: z.string().max(120).optional(),
    /**
     * ⚠️ DEVIATION FROM THE FROZEN SPEC — the one, and it is a hole, not a
     * preference. The frozen shape was `{ id, label?, rotate?, scale? }` with
     * membership implicit. Membership is *not* derivable from that: `nodes` is
     * a flat list with no parent pointer, and no geometry field may be added
     * (that is decision 3). So a group had no way to name its members, and
     * "bounding box derived from member nodes" had no members to derive from.
     *
     * It is added as OPTIONAL and additive, which is the smallest change that
     * makes the frozen spec coherent:
     *   • a group with no `nodeIds` still parses and is still valid;
     *   • no frozen invariant is weakened — `x`/`y`/`w`/`h` remain rejected,
     *     the box is still derived, determinism is unaffected;
     *   • it is an id *reference*, not a copy of anything, so it cannot become
     *     a second source of truth for a derived value.
     * If P5 cites this file as frozen, cite it as frozen *modulo this field*.
     */
    nodeIds: z.array(id()).max(1000).optional(),
    /** Clockwise rotation in degrees about the derived bounds' centre. */
    rotate: z.number().finite().optional(),
    /** Uniform scale about the derived bounds' centre. Must be > 0. */
    scale: z.number().gt(0).finite().max(100).optional(),
  })
  .strict();

export type CanvasGroup = z.infer<typeof CanvasGroupSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Page and document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One page. Flat: `nodes` is a list, `groups` is a list of *ids*, and the
 * membership relationship is "a node's id appears in exactly one group". There
 * is no nesting, because nesting is a Phase-3+ affordance and every level of
 * nesting added now is a level to migrate later.
 *
 * Array order in `nodes` is the paint order. See decision 1.
 */
export const PageSchema = z
  .object({
    id: id(),
    name: z.string().max(120).optional(),
    /** Overrides the document background for this page only. */
    background: ColorRefSchema.optional(),
    nodes: z.array(CanvasNodeSchema),
    /** Required (not defaulted) so membership is always explicit. */
    groups: z.array(CanvasGroupSchema),
  })
  .strict();

export type Page = z.infer<typeof PageSchema>;

/** The document root. `width`/`height` are the canvas, in px. */
export const DocSchema = z
  .object({
    id: id(),
    name: z.string().max(200),
    width: z.number().gt(0).max(20_000),
    height: z.number().gt(0).max(20_000),
    /** The default page background; a page may override it. */
    background: ColorRefSchema,
    pages: z.array(PageSchema).min(1),
  })
  .strict();

export type Doc = z.infer<typeof DocSchema>;

/**
 * The *input* side of `Doc`, which differs from `Doc` only where a field has a
 * default (`locked`, `visible`). Presets and LLM drafts are typed against this
 * so they can omit defaulted fields and still type-check.
 */
export type DocInput = z.input<typeof DocSchema>;
export type PageInput = z.input<typeof PageSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a document, throwing on failure. Use at trusted boundaries. */
export function parseDoc(value: unknown): Doc {
  return DocSchema.parse(value);
}

/** Parse a document, returning a discriminated result. Use at untrusted input. */
export function safeParseDoc(value: unknown) {
  return DocSchema.safeParse(value);
}
