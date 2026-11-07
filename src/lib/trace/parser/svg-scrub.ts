/**
 * lib/trace/parser/svg-scrub.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Security scrubbing for untrusted SVG markup.
 *
 * Removes active-content vectors from SVG markup, leaving all legitimate
 * rendering content (paths, shapes, gradients, filters, CSS custom properties)
 * untouched.
 *
 * Handles:
 *  - `<script>` elements, including self-closing and unclosed forms
 *  - `on*` event-handler attributes, with **quoted and unquoted** values
 *    (a quoted-only matcher is trivially bypassed by `onerror=alert(1)`)
 *  - `javascript:` and `data:text/html` URL schemes
 *  - `<foreignObject>` (can host arbitrary HTML)
 *
 * Ported from sagedesigns-os lib/motion/parser/svg-scrub.ts.
 */

/**
 * Removes active-content vectors from SVG markup.
 */
export function scrubDangerousSvgMarkup(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''

  let svg = raw

  // --- <script> ---------------------------------------------------------
  // Paired blocks first, then any stragglers (self-closing / unclosed / bare).
  svg = svg.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  svg = svg.replace(/<script\b[^>]*\/?>/gi, '')
  svg = svg.replace(/<\/script\s*>/gi, '')

  // --- inline event handlers -------------------------------------------
  // Quoted values first (must run before the unquoted form, which would
  // otherwise stop at the first quote character), then unquoted.
  svg = svg.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')

  // --- dangerous URL schemes -------------------------------------------
  svg = svg.replace(/javascript\s*:/gi, '')
  svg = svg.replace(/data\s*:\s*text\/html/gi, '')

  // --- <foreignObject> --------------------------------------------------
  svg = svg.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
  svg = svg.replace(/<foreignObject\b[^>]*\/?>/gi, '')

  return svg
}
