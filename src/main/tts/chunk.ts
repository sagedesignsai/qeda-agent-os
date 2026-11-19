/**
 * main/tts/chunk.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Long-form text preparation.
 *
 * Deepgram caps a single request at 2,000 characters, so long scripts are split
 * at the most natural boundary available. Escaped pronunciation markers
 * (`\{"word":"…","pronounce":"…"\}`) are atomic: splitting one in half produces
 * an invalid IPA request and a confusing provider error.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TtsPronunciation } from '../../lib/tts/types.js';

export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

const MAX_PRONUNCIATIONS = 500;
const MAX_IPA_LENGTH = 128;
const MARKER_RE = /\\\{[\s\S]*?\\\}/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markerRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  MARKER_RE.lastIndex = 0;
  for (const match of text.matchAll(MARKER_RE)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  return ranges;
}

/**
 * Replace whole-word occurrences outside existing marker regions.
 * Returns the rebuilt text and how many replacements landed.
 */
function replaceOutsideMarkers(
  text: string,
  word: string,
  marker: string,
): { text: string; applied: number } {
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])(${escapeRegExp(word)})(?=$|[^\\p{L}\\p{N}_])`,
    'gu',
  );
  let applied = 0;
  let output = '';
  let cursor = 0;
  MARKER_RE.lastIndex = 0;

  for (const match of text.matchAll(MARKER_RE)) {
    const start = match.index ?? 0;
    const before = text.slice(cursor, start);
    output += before.replace(pattern, (_whole, prefix: string) => {
      applied += 1;
      return `${prefix}${marker}`;
    });
    output += match[0];
    cursor = start + match[0].length;
  }

  output += text
    .slice(cursor)
    .replace(pattern, (_whole, prefix: string) => {
      applied += 1;
      return `${prefix}${marker}`;
    });

  return { text: output, applied };
}

/**
 * Apply IPA overrides using Deepgram's escaped inline marker syntax.
 *
 * `\{` and `\}` are literal text the provider parses. Invalid entries are
 * skipped and reported rather than failing the whole generation.
 */
export function applyPronunciations(
  text: string,
  entries: TtsPronunciation[] | undefined,
): { text: string; applied: number; warnings: string[] } {
  const warnings: string[] = [];
  if (!entries || entries.length === 0) {
    return { text, applied: 0, warnings };
  }
  if (entries.length > MAX_PRONUNCIATIONS) {
    warnings.push(
      `PRONUNCIATIONS_TRUNCATED:${MAX_PRONUNCIATIONS}:${entries.length}`,
    );
  }

  let output = text;
  let applied = 0;
  for (const entry of entries.slice(0, MAX_PRONUNCIATIONS)) {
    const word = entry.word?.trim();
    const ipa = entry.ipa?.trim();
    if (!word || !ipa) continue;
    if (ipa.length > MAX_IPA_LENGTH) {
      warnings.push(`PRONUNCIATION_TOO_LONG:${word}`);
      continue;
    }

    const marker = `\\{${JSON.stringify({ word, pronounce: ipa }).slice(1, -1)}\\}`;
    const result = replaceOutsideMarkers(output, word, marker);
    output = result.text;
    applied += result.applied;
  }

  return { text: output, applied, warnings };
}

function adjustCutForMarkers(
  cut: number,
  ranges: Array<{ start: number; end: number }>,
  start: number,
): number {
  for (const range of ranges) {
    if (cut > range.start && cut < range.end) {
      // Never split a marker. Prefer the marker start when it leaves content;
      // otherwise extend past the whole marker.
      return range.start > start ? range.start : range.end;
    }
  }
  return cut;
}

function lastParagraphBreak(text: string, start: number, end: number): number {
  const index = text.lastIndexOf('\n\n', end);
  return index >= start ? index + 2 : -1;
}

function lastSentenceBreak(text: string, start: number, end: number): number {
  for (let i = end - 1; i >= start; i -= 1) {
    if (!/[.!?]/.test(text[i]!)) continue;
    const next = text[i + 1];
    if (next === undefined || /\s/.test(next)) return i + 1;
  }
  return -1;
}

function lastWhitespace(text: string, start: number, end: number): number {
  for (let i = end - 1; i >= start; i -= 1) {
    if (/\s/.test(text[i]!)) return i + 1;
  }
  return -1;
}

/**
 * Split text into provider-sized chunks without breaking escaped markers.
 *
 * The returned `start`/`end` indexes refer to the normalized input so callers
 * can report character progress without re-searching the script.
 */
export function chunkText(text: string, maxChars: number): TextChunk[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!Number.isFinite(maxChars) || maxChars < 1) {
    throw new Error('chunkText requires a positive maxChars value.');
  }
  if (!normalized.trim()) return [];

  const ranges = markerRanges(normalized);
  const chunks: TextChunk[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    while (pos < normalized.length && /\s/.test(normalized[pos]!)) pos += 1;
    if (pos >= normalized.length) break;

    if (normalized.length - pos <= maxChars) {
      const slice = normalized.slice(pos);
      chunks.push({ text: slice.trim(), start: pos, end: normalized.length });
      break;
    }

    const hardEnd = pos + maxChars;
    const safeEnd = adjustCutForMarkers(hardEnd, ranges, pos);

    const candidates = [
      lastParagraphBreak(normalized, pos, safeEnd),
      lastSentenceBreak(normalized, pos, safeEnd),
      lastWhitespace(normalized, pos, safeEnd),
    ].filter((value) => value > pos && value <= safeEnd);

    let cut =
      candidates.length > 0 ? Math.max(...candidates) : safeEnd;

    cut = adjustCutForMarkers(cut, ranges, pos);
    if (cut <= pos) cut = safeEnd;

    const slice = normalized.slice(pos, cut);
    if (slice.trim()) {
      chunks.push({ text: slice.trim(), start: pos, end: cut });
    }
    pos = cut;
  }

  return chunks;
}
