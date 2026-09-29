/**
 * lib/canvas/tokens.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single place raw colour values live for the canvas document model.
 *
 * PROVENANCE. The shape of this file — a frozen `as const` record, a
 * `keyof`-derived closed name list, and a `tokenVarName` helper — is ported
 * from `src/lib/studio/tokens.ts` (itself a one-line derivation of the app
 * theme in `src/renderer/index.css`). The approach is copied deliberately; the
 * import is not, because `studio/` has zero consumers, a history of type errors
 * and is being edited concurrently. Copy, do not couple.
 *
 * Why a *frozen* copy rather than reading the live theme at compile time:
 *   A document is authored against semantic names (`accent`, `on-surface`),
 *   never raw colours — that is what makes two documents authored weeks apart,
 *   by two people, comparable and mergeable. The names must however resolve to
 *   values that do not move under the author's feet. An export is a promise:
 *   "this file, rendered today, is the artefact that was shared". If a later
 *   theme tweak silently repainted every previously saved export, the
 *   composition would stop being reproducible.
 *
 * WHY THESE VALUES DIFFER FROM `studio/`. The studio composer renders *app
 * chrome* and reuses the app's dark theme verbatim. A canvas document is
 * exported content — an OG card, a social post, a story — which is light by
 * default and brand-forward. Reusing dark app-chrome tokens here would make
 * every export look like a screenshot of the IDE. This is a deliberate
 * divergence, and it is the reason the values are frozen twice rather than
 * shared once. Changing this map is a deliberate, breaking act for saved
 * exports; document it in the changelog when you do.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Closed list of semantic token names a document may reference. Typed from the
 * record below, so the name list and the value map cannot drift apart.
 *
 * `surface*` / `on-surface*` are the page and text pair; `accent` / `on-accent`
 * and `brand*` are the two chromatic families; the rest are status and chrome.
 * There is deliberately no `sidebar-*` family — navigation chrome has no
 * business in an exported image.
 */
export const TOKEN_VALUES = {
  // ── Surfaces ──────────────────────────────────────────────────────────────
  surface: '#ffffff',
  'surface-2': '#f2f4f7',
  'on-surface': '#0b1220',
  'on-surface-muted': '#5b6675',
  // ── Accents ───────────────────────────────────────────────────────────────
  accent: '#ff5a3c',
  'on-accent': '#ffffff',
  brand: '#3b5bdb',
  'brand-strong': '#24389e',
  // ── Status ────────────────────────────────────────────────────────────────
  success: '#14804a',
  warning: '#b26a00',
  danger: '#c0392b',
  // ── Chrome ────────────────────────────────────────────────────────────────
  border: '#dfe3ea',
} as const;

/** A semantic design-token name. Closed — an unknown name is a validation error. */
export type TokenName = keyof typeof TOKEN_VALUES;

/**
 * Runtime list of the same names, for validation and for iterating `:root`.
 * Cast to a non-empty tuple because `z.enum` requires one; the cast is sound
 * here because the record literal is statically non-empty, and `TokenName` is
 * derived from that same record, so the two cannot disagree.
 */
export const TOKEN_NAMES = Object.keys(TOKEN_VALUES) as [
  TokenName,
  ...TokenName[],
];

/** Frozen token name → concrete CSS colour value. */
export const TOKEN_COLORS: Record<TokenName, string> = TOKEN_VALUES;

/** The CSS custom-property name a token compiles to (`accent` → `--accent`). */
export function tokenVarName(name: TokenName): string {
  return `--${name}`;
}

/**
 * The system font stack. Exported from v1 with no webfont alternative — see
 * the "no webfonts" decision in `README.md`. This is a variable, not a literal,
 * so a future phase can repoint it without touching a single node.
 */
export const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

/**
 * The monospace stack. Not referenced by any node in v1 — the schema has no
 * per-node font-family field, because "which typeface" is a Phase 2+ question
 * and adding a field now would be a field to migrate later. Declared here so a
 * future phase has one place to point at.
 */
export const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/** The custom property holding the default font stack. */
export const FONT_VAR = '--canvas-font';
