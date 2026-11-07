/**
 * lib/trace/parser/style-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses CSS inline style declarations (e.g. style="fill:#f59e0b; stroke-width: 2;")
 * into camelCase attributes.
 *
 * Ported from sagedesigns-os lib/motion/parser/style-parser.ts.
 */

/**
 * Parses inline CSS style strings into camelCase attribute objects.
 */
export function parseInlineStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!styleStr) return result

  const rules = styleStr.split(';')
  for (const rule of rules) {
    const colonIndex = rule.indexOf(':')
    if (colonIndex <= 0) continue

    const prop = rule.slice(0, colonIndex).trim().toLowerCase()
    const value = rule.slice(colonIndex + 1).trim()
    if (!prop || !value) continue

    // Convert hyphen-case to camelCase (e.g. fill-opacity -> fillOpacity)
    const camelProp = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    result[camelProp] = value
  }

  return result
}
