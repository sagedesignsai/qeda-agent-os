/**
 * lib/studio/captions/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Caption style catalog and pure timing resolvers.
 *
 * The renderer needs two things the raw model doesn't hand it directly:
 *   1. which caption is live at the playhead, and
 *   2. per-word timings to drive the karaoke highlight.
 *
 * Word timings may be absent (a hand-typed caption has none), so they are
 * *derived* evenly across the caption span. This means every caption can be
 * rendered in the karaoke style without a transcription pass.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  StudioCaption,
  StudioCaptionStyle,
  StudioCaptionWord,
} from '../types';

export interface StudioCaptionStyleDefinition {
  style: StudioCaptionStyle;
  label: string;
  description: string;
}

export const STUDIO_CAPTION_STYLES: StudioCaptionStyleDefinition[] = [
  {
    style: 'karaoke',
    label: 'Karaoke',
    description: 'Word-by-word highlight driving the caption line.',
  },
  {
    style: 'minimal',
    label: 'Minimal',
    description: 'Clean lower-third text with a soft edge shadow.',
  },
  {
    style: 'badge',
    label: 'Badge',
    description: 'Enclosed capsule pill behind the line.',
  },
];

/** Caption whose inclusive span contains the playhead, earliest first. */
export function resolveActiveStudioCaption(
  captions: readonly StudioCaption[] | undefined,
  timeMs: number,
): StudioCaption | null {
  if (!captions || captions.length === 0) return null;
  const active = captions
    .filter((caption) => timeMs >= caption.startMs && timeMs <= caption.endMs)
    .sort((a, b) => a.startMs - b.startMs);
  return active[0] ?? null;
}

/**
 * Word timings for a caption. Real timings win; otherwise the text is split on
 * whitespace and the caption's span is divided proportionally to word length so
 * longer words hold the highlight longer.
 */
export function resolveCaptionWordTimings(
  caption: StudioCaption,
): StudioCaptionWord[] {
  if (caption.words && caption.words.length > 0) {
    return [...caption.words].sort((a, b) => a.startMs - b.startMs);
  }

  const tokens = caption.text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const span = Math.max(1, caption.endMs - caption.startMs);
  const weights = tokens.map((token) => Math.max(1, token.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = caption.startMs;
  return tokens.map((word, index) => {
    const isLast = index === tokens.length - 1;
    const duration = isLast
      ? caption.endMs - cursor
      : Math.round((weights[index] / totalWeight) * span);
    const startMs = cursor;
    const endMs = isLast ? caption.endMs : startMs + duration;
    cursor = endMs;
    return { word, startMs, endMs };
  });
}

/**
 * Index of the word currently being spoken, or the most recent one while
 * between words. Returns -1 before the first word starts.
 */
export function resolveActiveWordIndex(
  words: readonly StudioCaptionWord[],
  timeMs: number,
): number {
  if (words.length === 0) return -1;
  if (timeMs < words[0].startMs) return -1;
  let active = 0;
  for (let index = 0; index < words.length; index += 1) {
    if (timeMs >= words[index].startMs) active = index;
    else break;
  }
  return active;
}
