/**
 * main/tts/duration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Audio duration for library metadata and Studio/Motion timelines.
 *
 * WAV is computed from the PCM header — exact and dependency-free. Every other
 * format goes through `music-tag-native`, which is already a runtime dependency
 * of the music library. A failure returns null rather than blocking a
 * generation that otherwise succeeded.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import { MusicTagger } from 'music-tag-native';
import type { TtsFormat } from '../../lib/tts/types.js';
import { parseWav } from './stitch.js';

export function wavDurationMs(bytes: Uint8Array): number | null {
  try {
    const { pcm, sampleRate, channels, bitsPerSample } = parseWav(bytes);
    const bytesPerFrame = channels * (bitsPerSample / 8);
    if (!bytesPerFrame || !sampleRate) return null;
    const frames = pcm.byteLength / bytesPerFrame;
    return Math.round((frames / sampleRate) * 1000);
  } catch {
    return null;
  }
}

/** Duration for bytes we already hold; currently exact for WAV only. */
export function audioDurationMsFromBytes(
  bytes: Uint8Array,
  format: TtsFormat,
): number | null {
  return format === 'wav' ? wavDurationMs(bytes) : null;
}

export async function probeAudioDurationMs(
  filePath: string,
  format: TtsFormat,
): Promise<number | null> {
  if (format === 'wav') {
    try {
      return wavDurationMs(new Uint8Array(await fs.readFile(filePath)));
    } catch {
      return null;
    }
  }

  const tagger = new MusicTagger();
  try {
    tagger.loadPath(filePath);
    const seconds = tagger.duration;
    return Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds * 1000)
      : null;
  } catch {
    return null;
  } finally {
    tagger.dispose();
  }
}
