/**
 * lib/trace/runtime/subtitles.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Engine-owned subtitles for narrated compositions.
 *
 * Subtitles belong to the engine, not to the document: a scene author never
 * places text in the subtitle band by hand, and the same timing function drives
 * the editor overlay and the exported video. Phrases split on punctuation and
 * at a readable length, then share the line's measured duration proportionally.
 *
 * Pure and DOM-free so it is testable in jsdom and usable from the renderer.
 */

import type {
  TraceNarration,
  TraceNarrationLine,
  TraceProject,
} from '../types';

export interface SubtitleFrame {
  lineId: string;
  text: string;
  speaker?: string;
}

/**
 * DOM ids shared by the renderer (which mounts the layer) and the runtime
 * (which writes into it). Defined here so the two sides cannot drift.
 */
export const TRACE_SUBTITLE_GROUP_ID = 'trace-subtitle-group';
export const TRACE_SUBTITLE_BG_ID = 'trace-subtitle-bg';
export const TRACE_SUBTITLE_TEXT_ID = 'trace-subtitle-text';

/** Keep the last phrase on screen across the cut, matching the voice. */
const SUBTITLE_HOLD_MS = 120;
const PHRASE_MAX_WORDS = 8;
const PHRASE_MAX_CHARS = 46;

/** The line whose audio is currently speaking, if any. */
export function activeNarrationLine(
  narration: TraceNarration | undefined,
  timeMs: number,
): TraceNarrationLine | null {
  if (!narration) return null;
  for (const line of narration.lines) {
    const start = line.startMs;
    const duration = line.durationMs;
    if (
      typeof start !== 'number' ||
      typeof duration !== 'number' ||
      duration <= 0
    ) {
      continue;
    }
    if (timeMs >= start && timeMs < start + duration + SUBTITLE_HOLD_MS) {
      return line;
    }
  }
  return null;
}

/**
 * Group words into readable phrases: break after sentence punctuation, and cap
 * at either the word or character limit — whichever comes first.
 */
export function splitSubtitlePhrases(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const phrases: string[] = [];
  let current: string[] = [];
  let length = 0;

  for (const word of words) {
    const nextLength = length + (current.length > 0 ? 1 : 0) + word.length;
    const overLimit =
      current.length >= PHRASE_MAX_WORDS || nextLength > PHRASE_MAX_CHARS;
    if (overLimit && current.length > 0) {
      phrases.push(current.join(' '));
      current = [];
      length = 0;
    }
    current.push(word);
    length += (current.length > 1 ? 1 : 0) + word.length;

    if (/[,.:;!?…]$/.test(word) && current.length >= 3) {
      phrases.push(current.join(' '));
      current = [];
      length = 0;
    }
  }
  if (current.length > 0) phrases.push(current.join(' '));
  return phrases;
}

export interface SubtitlePhraseTiming {
  text: string;
  durationMs: number;
}

/** Distribute a line's measured duration across its phrases by character weight. */
export function subtitlePhraseTimings(
  line: TraceNarrationLine,
): SubtitlePhraseTiming[] {
  const phrases = splitSubtitlePhrases(line.text);
  if (phrases.length === 0) return [];
  const duration =
    typeof line.durationMs === 'number' && line.durationMs > 0
      ? line.durationMs
      : 0;
  const weights = phrases.map((phrase) => Math.max(1, phrase.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return phrases.map((text, index) => ({
    text,
    durationMs: Math.round((duration * weights[index]) / total),
  }));
}

/** The subtitle to draw at `timeMs`, or null between lines. */
export function subtitleAtTime(
  project: TraceProject,
  timeMs: number,
): SubtitleFrame | null {
  const line = activeNarrationLine(project.narration, timeMs);
  if (!line) return null;

  const timings = subtitlePhraseTimings(line);
  if (timings.length === 0) return null;

  const elapsed = timeMs - (line.startMs ?? 0);
  let cursor = 0;
  for (const phrase of timings) {
    if (elapsed < cursor + phrase.durationMs) {
      return {
        lineId: line.id,
        text: phrase.text,
        ...(line.speaker ? { speaker: line.speaker } : {}),
      };
    }
    cursor += phrase.durationMs;
  }

  const last = timings[timings.length - 1];
  return {
    lineId: line.id,
    text: last.text,
    ...(line.speaker ? { speaker: line.speaker } : {}),
  };
}