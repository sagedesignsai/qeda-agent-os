/**
 * lib/trace/embed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trace embed placement normalization.
 *
 * Adapted from sagedesigns-os lib/motion/embed.ts for Nova Trace.
 */

import type { TraceEmbedPlacement } from './types';

export const TRACE_EMBED_PLACEMENTS: TraceEmbedPlacement[] = [
  'inline',
  'hero',
  'sidebar',
];

/**
 * Normalises values coming from the database or a form. Unknown placements
 * fall back to inline so a malformed row never disappears from the article.
 */
export function normalizeTraceEmbedPlacement(
  value: unknown,
): TraceEmbedPlacement {
  return TRACE_EMBED_PLACEMENTS.includes(value as TraceEmbedPlacement)
    ? (value as TraceEmbedPlacement)
    : 'inline';
}
