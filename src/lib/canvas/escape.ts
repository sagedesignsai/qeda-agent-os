/**
 * lib/canvas/escape.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The escaping trio, and the only place in the module where escaping happens.
 *
 * PROVENANCE. Ported verbatim in approach from `src/lib/studio/compile.ts:74-111`
 * (`escapeText` / `escapeAttr` / `cssSafe`), which is tested and correct. It is
 * copied rather than imported because `studio/` has zero consumers, a history of
 * type errors, and is under concurrent edit. If these three functions ever need
 * to change, change both and keep the semantics identical.
 *
 * Why centralise them at all: a document carries author- *and* LLM-supplied
 * strings, and the compiled HTML is destined for a `srcdoc` iframe. A missed
 * escape at one call site is an XSS, and the failure mode is silent. A single
 * audited module makes "did you escape that?" a grep, not an audit.
 *
 * The division of labour is deliberate and not interchangeable:
 *   • `escapeText` — HTML text content. Quotes escaped too, even though they are
 *     inert there, because document strings round-trip through tools that treat
 *     them as attribute values and a raw `"` is the kind of thing that only
 *     fails in production.
 *   • `escapeAttr` — double-quoted attribute values. Single quotes left alone on
 *     purpose: the CSP meta is full of them (`default-src 'none'`) and leaving
 *     them literal keeps the emitted policy greppable while staying correct
 *     inside double quotes.
 *   • `cssSafe` — last line of defence for values interpolated into the
 *     `<style>` block: no angle brackets (nothing can close the element early),
 *     no backslash (no CSS escapes smuggled in), no newlines (no new rule can be
 *     injected). It is NOT an HTML escaper and never replaces `escapeAttr` at a
 *     `style="…"` call site.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TEXT_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape for HTML *text* content. */
export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (c) => TEXT_ESCAPES[c] ?? c);
}

/** Escape for a double-quoted HTML *attribute* value. */
export function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (c) => TEXT_ESCAPES[c] ?? c);
}

/**
 * Strip everything dangerous from a value headed for the `<style>` block.
 *
 * Applied *after* the value has been assembled from validated numbers, resolved
 * token names and schema-validated colours — this is belt, not braces. The
 * schema is what actually rejects `url(…); }` — see `cssColor` in `schema.ts`.
 */
export function cssSafe(value: string): string {
  return value.replace(/[<>{}\\]/g, '').replace(/[\r\n]+/g, ' ');
}
