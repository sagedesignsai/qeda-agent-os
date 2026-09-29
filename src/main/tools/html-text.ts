/**
 * tools/html-text.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure HTML → plain-text conversion for LLM consumption. No DOM parser: good
 * enough for documentation pages, articles and wikis, which is what research
 * fetches. Kept dependency-free so it is unit-testable in isolation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BLOCK_TAGS =
  /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<noscript\b[^>]*>[\s\S]*?<\/noscript>|<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function htmlToText(html: string): string {
  return html
    .replace(BLOCK_TAGS, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

export function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return undefined;
  return htmlToText(match[1]);
}
