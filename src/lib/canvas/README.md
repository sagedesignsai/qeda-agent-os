# `src/lib/canvas` — ADR

**Status:** frozen (Phase 1, post-Oracle-review)
**Scope:** a pure, UI-free canvas document model + HTML compiler.
**Importable from:** the renderer and a plain unit test. No React, no Electron,
no Node imports, no I/O, no filesystem.

This file is the record of *why* the model looks the way it does. P5 cites the
schema as frozen; that claim is only meaningful if the decisions are written
down, so they are written down here.

---

## 1. The one-paragraph version

A canvas document is a plain JSON value. It is authored by humans **and** by an
LLM, diffed in git, stored in SQLite, and compiled to HTML. It is therefore
**intent, never measurement**, and never a picture of a render. Everything below
follows from that one sentence: an absent value means *"do not constrain
this"*, never *"this is zero"*.

## 2. Layout

| File | Responsibility |
| --- | --- |
| `schema.ts` | zod schemas + inferred types. The definition of the model. |
| `style.ts` | `nodeStyle(node)`. **The single source of truth for geometry.** |
| `tokens.ts` | Frozen semantic design tokens. |
| `escape.ts` | `escapeText` / `escapeAttr` / `cssSafe`. |
| `normalize.ts` | The ingest chokepoint. |
| `compile.ts` | `compilePage` (HTML) + `docOutline` (text). |
| `presets.ts` | 1200×630, 1080×1080, 1080×1920 templates. |
| `index.ts` | Explicit barrel. |

Naming convention at the barrel: **types are bare, schemas carry a `Schema`
suffix.** `Doc` is the type; `DocSchema` is the validator. A single export name
cannot be both a value and a type through a barrel, and a reader who has to
remember which one `Doc` is has already lost.

## 3. The frozen decisions

### D1 — There is no `z` field. Array order *is* the z-order.

Paint later, sit on top. Bring-to-front is a `splice`.

A `z` field is a second ordering system that can always disagree with the
first, and it drags a tail of consequences: ties, gaps, reindex-on-delete, and a
`NaN` sentinel for "no z". Array order has none of these, and diffs of a
reordered document are human-readable.

### D2 — `h` is required for `shape` and `image`; optional for `text`.

For a text node, **absent `h` means "as tall as the content needs"**.

A shape or an image has no content-driven size, so a missing `h` is a broken
layout, not an intent. A text node is the opposite: "grow to fit" is a complete,
legitimate instruction that no renderer may contradict.

This is the decision that makes the whole model work, and the corollary is
absolute: **no measured height may ever be written back into a document.** The
moment a cached or measured value appears, `h` stops meaning "what the author
asked for" and starts meaning "what the last render happened to produce". The
document stops being diffable, mergeable and LLM-editable, and the bug is
invisible until someone reopens it on a machine with different fonts. Pinned by
four tests (`canvas-compile.test.ts`, "text height is emitted only when
authored").

### D3 — `Group` has no `x`/`y`/`w`/`h`, and the schema **rejects** them.

Its bounding box is *derived* from its member nodes (`groupBounds`).

Storing it would create a second source of truth for a derived value, and the
group→node migration (P4) would inherit every disagreement between the two
copies. So these keys are not merely undocumented — they are a **reservation**,
asserted by a `it.each(['x','y','w','h'])` test. This is the most important
rejection in the model.

The derived box is an axis-aligned union of member bounds *including each
member's own rotation* (four rotated corners → AABB), so a group's pivot is
exact rather than approximately centred.

### D4 — Exactly three node kinds, and the union is closed.

`text | shape | image`. A fourth kind is a deliberate schema change with a
migration attached, not an additive edit. A small closed union also means the
compiler's switch is exhaustive and a new kind cannot half-render.

### D5 — Fill/colour stay kind-specific; only genuinely-shared paint is shared.

`fill` is a shape's background, `color` is a text node's foreground, and an
image has neither. They are the same *type* and deliberately not the same
*field*: merging them would let an image "have a fill", which is meaningless and
would then need a migration to remove.

What IS shared, in a strict `style` object, is what really is identical on all
three kinds: `radius`, `stroke`, `strokeWidth`, `shadow`.

### D6 — Every node requires a stable `id`. Never array-index identity.

Selection, undo remapping and the layer panel all key off it. An array index is
not a weaker id, it is *no* id: a splice at the front of the array would
silently re-target the user's selection. `normalizeDoc` mints an id for any node
that arrives without one.

### D7 — Bounded, strict, and non-finite-hostile numbers.

`opacity` is `[0,1]`, `rotate` is degrees, `scale` is uniform and `> 0`
(a zero or negative scale is a singular transform with no inverse — dragging
back from it is undefined). Every object is `.strict()`: an LLM that invents a
field is **told**, rather than having it silently dropped — otherwise a document
can look correct and render wrong with no signal anywhere.

Colours and shadows are **allow-listed, not deny-listed**, for the same reason
as D7: both land in a `style` attribute, and `url(…); }` is enough to add a
rule. `:` is excluded from the colour grammar, which is what makes
`url(http:…)` unrepresentable rather than merely unlikely.

`z.number()` in zod 4.6.5 already rejects `NaN`, `±Infinity` **and does not
coerce numeric strings** — verified, not assumed. The schema is therefore the
strict gate and coercion belongs to `normalizeDoc` alone.

### D8 — Normalization happens on every ingest path, at the boundary.

Documents arrive from an LLM, from an import, from a future drag-and-drop
editor, and from the database. Each emits `"12"` where a number belongs,
`opacity: 4`, a `rotate: NaN`, and nodes with no id. Each is dealt with
**exactly once**, at the boundary — because a `Number()` here and a clamp there
is how a renderer ends up with geometry nobody can explain.

**`NaN`/`Infinity` → coerce-and-fail-loudly (throw), not substitute.** `0` is a
*valid* x-coordinate, so substituting it makes a broken document
indistinguishable from a correct one — strictly worse than failing loudly with a
path-qualified message. Out-of-range-but-finite values (`opacity: 4`) get the
opposite treatment and are **clamped**, because the intent is obvious and the
author's work is worth more than their arithmetic.

Lengths are rounded to 2dp at ingest *and* at the style boundary — the same
boundary `style.ts` rounds at, so the document and the rendered output can never
disagree by a third decimal.

`normalizeDoc` is **not** a pure function of its input: it mints ids with
`nanoid`. That is why the determinism guarantee is stated over a `Doc` (already
normalized and parsed) and not over raw input. Everything after normalization
is pure.

### D9 — The emitter never emits a class name. Inline `style` only.

Tailwind v4 purges classes it cannot see in a registered `@source` directory,
and classes produced at *runtime* — which is exactly what a compiler emits — are
dropped with **zero diagnostics**. A single class-based rule would silently
vanish and the export would be unstyled, in production, with a clean build.

Inline styles cannot be purged, so they cannot vanish. The `class`-attribute test
is the guard rail, and the rule is load-bearing: do not add one.

### D10 — The emitter adds no geometry of its own.

`compilePage` stringifies `nodeStyle(node)` and nothing else. If something is
missing from the output it is missing in `style.ts` — which is the correct place
for that conversation to happen. The one wrapper the emitter does add (a group's
transform container) gets its style from `groupStyle()`, in the same module.

**Why this matters:** `nodeStyle` is consumed by *both* the HTML emitter
(stringified) and the future React canvas (passed to `style`). One function, two
consumers. If the editor drew nodes with one geometry path and exported them
with another, they would drift — invisibly in review, absent from the diff, and
baked into every exported artefact forever. Structurally impossible beats
reviewed.

### D11 — Determinism, over the HTML string only.

`compilePage(doc, page) === compilePage(doc, page)`, byte for byte, across
repeated calls and for every preset. That is what makes an export worth
trusting: same document in, same artefact out, forever.

⚠️ **This does not extend to PNG or PDF bytes.** Rasterization is not
deterministic — GPU, antialiasing and the font rasterizer all vary. A
pixel-equality test would be flaky by construction. **Do not write one.**

### D12 — Self-contained: `default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:`

**There is no `file:`.** `studio/compile.ts` has one; this does not. `file:`
was an existence-oracle channel: with it granted, a document could probe the
user's disk and learn *whether* a path exists from the difference between a
rendered image and a broken one. And a granted capability widens *silently*
later — once `file:` is in the policy, a later "just for local dev" addition is
invisible in review, because the capability is already there. So v1 starts with
no filesystem access and treats needing it as a deliberate schema change.

Practical consequence: images **must** be resolved to `data:` URIs before
compilation. That is `CompileOptions.assets`, and the allow-list is inside the
compiler, so the guarantee does not depend on every caller being careful. An
unresolved asset becomes a transparent pixel — visibly empty rather than a
broken-image glyph or a `file://` URL.

### D13 — No webfonts in v1. System stack only. **Deliberate, not an oversight.**

`font-src data:` in the CSP invites exactly the wrong question, so: a webfont
means base64-inlining megabytes per export, and it introduces a whole class of
"renders differently on the user's machine". Both were accepted costs. The stack
is a CSS variable (`--canvas-font`) so a later phase can repoint it without
touching a single node.

## 4. Explicit non-goals for Phase 1

Each of these is a real design question that is **deferred on purpose**, not
overlooked. None of them may be smuggled in as an incidental edit.

- **No text measurement.** No line-breaking, no shrink-to-fit. `fit: 'shrink'`
  is *reserved*: `style.ts` currently degrades it to clipping, because true
  shrink-to-fit needs measurement, and measurement is Phase 2. The key exists
  so the schema does not have to change when measurement arrives.
- **No multi-page assembly.** `compilePage` emits exactly one page. A
  `compileDocument` wrapper with `break-after: page` is Phase 3.
- **No node animation.** See §5.
- **No webfonts, no gradients, no blend modes, no per-node font family.**
- **No nested groups, no per-node `z`, no zod `z.lazy`.** The model is flat by
  design; there is no recursion in it and reaching for `z.lazy` means a cycle
  has crept in.
- **No asset storage.** Bytes live elsewhere; the document holds an id.
- **No rasterization.** Deliberately out of scope, and see D11.

## 5. Two gaps in the frozen spec, and how they were handled

Reported rather than silently redesigned, per the brief. Both are one-line
reversals if the reviewer disagrees.

### 5.1 `Group` had no way to name its members

The frozen shape was `{ id, label?, rotate?, scale? }` with membership implicit.
Membership is **not derivable** from that: `nodes` is a flat list with no parent
pointer, and no geometry field may be added (that is D3). So a group had no way
to name its members, and "bounding box derived from member nodes" had no members
to derive from.

Handled by adding **one optional, additive** field: `nodeIds?: string[]`.

- A group without `nodeIds` still parses and is still valid.
- No frozen invariant is weakened: `x`/`y`/`w`/`h` remain rejected, the box is
  still derived, determinism is unaffected.
- It is an id *reference*, not a copy of anything, so it cannot become a second
  source of truth.

**P5 should cite the schema as frozen _modulo `nodeIds`_.** If a reviewer
prefers, the alternative is to drop group membership from v1 entirely — groups
become page-wide transforms, and `nodeIds` goes away with them.

### 5.2 The emitter has animation machinery that no document can reach

The brief's test list requires "every animation → `@keyframes` + declaration",
but **the frozen schema has no animation field on a node**. Nothing in a
schema-valid `Doc` can be animated, so `compilePage` emits no `@keyframes` at
all.

`ANIMATIONS` and `animationStyle()` are implemented and tested, and `compilePage`
is wired for them, but the `Doc` cannot currently trigger the path. Adding an
`enter` field to a node is a **schema change**, which the brief forbids me from
making silently — so the seam is in place, tested, and unwired. The
"no `@keyframes` when unanimated" invariant is asserted for every preset, and
the "declaration is always paired with its keyframes" invariant is asserted over
the preset table.

## 6. zod discipline (learned the hard way in `studio/`)

`studio/` carries 13 type errors from annotating schemas with their own types.
Three rules avoid repeating them:

1. **Never annotate a schema with its own type.** `const N: z.ZodType<CanvasNode>`
   is a *wider* contract than any concrete schema can satisfy in zod 4, because
   `ZodType` now carries `Output`, `Input` **and an invariant `Internals`**. That
   wider contract is exactly what breaks `discriminatedUnion`. So:
   `export const N = …; export type N = z.infer<typeof N>;`
   **Types are derived downward from schemas, never pushed upward onto them.**
2. **No `z.lazy`.** There is no recursion in this model — `nodes[]` is flat and
   `groups[]` holds no nodes. If you reach for `z.lazy`, re-check the design.
3. **A re-export creates no local binding.** `export type { X } from './y'` and
   then *using* `X` is an error at best and a silent `any` at worst. Import
   first, export second.

## 7. Provenance

`escape.ts` and the shape of `tokens.ts` are **ported** from
`src/lib/studio/compile.ts:74-111` and `src/lib/studio/tokens.ts` — copied, not
imported. `studio/` has zero consumers, a history of type errors, and was under
concurrent edit when this was written; coupling the two would make that its
problem.

The two modules are **deliberately not sharing values**:

- `studio/` reuses the app's **dark** theme, because it renders app chrome.
- `canvas/` is a **light, brand-forward** palette, because it renders exported
  content. Reusing dark app-chrome tokens would make every export look like a
  screenshot of the IDE.

Both are frozen, and changing either is a deliberate, breaking act for saved
exports.

## 8. Verification

```bash
npx jest src/__tests__/canvas                                  # 91 tests
npx tsc --noEmit -p tsconfig.json                              # clean for src/lib/canvas
npx eslint src/lib/canvas src/__tests__/canvas-*.test.ts
```

The determinism guarantee covers the HTML string only — see D11.
