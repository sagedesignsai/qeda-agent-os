/**
 * lib/studio/tokens.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single place raw colour values live for the Studio composer.
 *
 * Why a frozen copy instead of reading the theme at compile time:
 *   A Studio composition is authored against *semantic names* (`primary`,
 *   `muted-foreground`), never raw colours — that is what makes two documents
 *   authored weeks apart, by two different plugins, comparable and mergeable.
 *   The names, however, must resolve to a value that does not move under the
 *   author's feet. An export is a promise: "this file, rendered today, is the
 *   artefact that was shared". If a later theme tweak silently repainted every
 *   previously saved export, the composition would stop being reproducible and
 *   the bytes would stop being stable.
 *
 *   So these values are *frozen export-time values*, not a view of the running
 *   theme. They are the app's dark-theme semantics from
 *   `src/renderer/index.css` (`.dark` block — dark is this app's primary
 *   surface) converted from `oklch()` to hex at authoring time:
 *     • large surfaces keep very low chroma so they read as deep blue-black
 *     • accents carry the chroma, so the only saturated thing is actionable
 *     • body copy and borders are near-neutral with a whisper of blue
 *   Changing this map is a deliberate, breaking act for saved exports.
 *
 * The `sidebar-*` family from the app theme is deliberately excluded: sidebar
 * tokens are navigation chrome, and app chrome has no business in an exported
 * image. `popover` is kept because it is a legitimate surface token.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Closed list of semantic token names a Studio document may reference. Must stay
 * in sync with `TOKEN_VALUES` below — the record is typed, so a drift is a
 * compile error rather than a runtime `undefined`.
 *
 * `TOKEN_NAMES` is derived from the record's keys, so the enum source and the
 * values map cannot disagree.
 */
export const TOKEN_VALUES = {
  // ── Surfaces ──────────────────────────────────────────────────────────────
  background: '#090c13',
  foreground: '#f5f7f9',
  card: '#11161e',
  'card-foreground': '#f5f7f9',
  popover: '#141922',
  'popover-foreground': '#f5f7f9',
  // ── Accents / interactive ─────────────────────────────────────────────────
  primary: '#3384f0',
  'primary-foreground': '#fafcff',
  secondary: '#1e242e',
  'secondary-foreground': '#f0f2f4',
  muted: '#1e242e',
  'muted-foreground': '#99a3b1',
  accent: '#1c2e49',
  'accent-foreground': '#b7d7ff',
  destructive: '#f24f4e',
  // ── Chrome ────────────────────────────────────────────────────────────────
  border: '#d0d8e51c',
  input: '#d0d8e524',
  ring: '#3384f0',
  // ── Categorical (for data-ish marks: dots, bars, swatches) ────────────────
  'chart-1': '#3384f0',
  'chart-2': '#00b6c7',
  'chart-3': '#2fc183',
  'chart-4': '#e0af3b',
  'chart-5': '#dd6cd6',
} as const;

/** A semantic design-token name. Closed — unknown names are a validation error. */
export type TokenName = keyof typeof TOKEN_VALUES;

/** Runtime list of the same names, for validation and for iterating `:root`. */
export const TOKEN_NAMES = Object.keys(TOKEN_VALUES) as TokenName[];

/** Frozen token name → concrete CSS colour value. */
export const TOKEN_COLORS: Record<TokenName, string> = TOKEN_VALUES;

/** The CSS custom-property name a token compiles to (e.g. `muted-foreground` → `--muted-foreground`). */
export function tokenVarName(name: TokenName): string {
  return `--${name}`;
}
