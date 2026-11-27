/**
 * lib/trace/runtime/narration-audio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Plays the narration in sync with the transport.
 *
 * Each line is an ordinary `<audio>` element pointed at the shared
 * `qeda-media://tts/<assetId>` host. The driver is deliberately simple: the
 * active line is resolved from the same timing function the subtitles use, a
 * line change swaps the element, and a seek re-aligns `currentTime`. Playback
 * of a line that is already playing is left alone, so normal playback does not
 * stutter.
 *
 * Guarded for jsdom and headless hosts, where `Audio` may not exist.
 */

import type { TraceProject } from '../types';
import { activeNarrationLine } from './subtitles';

const audioCache = new Map<string, HTMLAudioElement>();
let activeLineId: string | null = null;
let activeAudio: HTMLAudioElement | null = null;

function audioAvailable(): boolean {
  return typeof Audio !== 'undefined';
}

function sourceFor(assetId: string): string {
  return `qeda-media://tts/${assetId}`;
}

/** Stop the current line (pause, keep the element cached for a re-play). */
export function stopNarrationAudio(): void {
  if (activeAudio && !activeAudio.paused) activeAudio.pause();
  activeAudio = null;
  activeLineId = null;
}

/**
 * Align narration audio with the transport.
 *
 * `playing` false pauses the current line but keeps it warm, so scrubbing does
 * not rebuild the cache and pressing play resumes instantly.
 */
export function syncNarrationAudio(
  project: TraceProject | null | undefined,
  timeMs: number,
  playing: boolean,
): void {
  if (!audioAvailable()) return;

  const line = activeNarrationLine(project?.narration, timeMs);
  if (!line?.ttsAssetId) {
    if (activeAudio && !activeAudio.paused) activeAudio.pause();
    activeLineId = null;
    return;
  }

  const source = sourceFor(line.ttsAssetId);
  if (line.id !== activeLineId) {
    if (activeAudio && !activeAudio.paused) activeAudio.pause();
    let audio = audioCache.get(line.id);
    if (!audio) {
      audio = new Audio(source);
      audio.preload = 'auto';
      audioCache.set(line.id, audio);
    } else if (audio.src !== source) {
      audio.src = source;
    }
    activeAudio = audio;
    activeLineId = line.id;
  }

  if (!activeAudio) return;

  const offsetSeconds = Math.max(0, (timeMs - (line.startMs ?? 0)) / 1000);
  if (playing) {
    if (
      activeAudio.readyState > 0 &&
      Math.abs(activeAudio.currentTime - offsetSeconds) > 0.2
    ) {
      try {
        activeAudio.currentTime = offsetSeconds;
      } catch {
        // Element is not seekable yet; the next sync will realign it.
      }
    }
    if (activeAudio.paused) {
      void activeAudio.play().catch(() => {
        // Autoplay may be blocked before a user gesture; the transport will
        // start with the next gesture-driven play.
      });
    }
  } else if (!activeAudio.paused) {
    activeAudio.pause();
  }
}