/**
 * main/trace/narration-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voiceover synthesis for narrated Trace compositions.
 *
 * One spoken line in, one TTS asset out — with the MEASURED duration. The
 * engine already caches on (text, voice, params) via `reuse`, so an unchanged
 * line re-runs for free and only edited lines are synthesized again.
 *
 * A line without a measurable duration is an error, not a guess: every later
 * timing decision depends on the number being real ("voices before pictures").
 */

import type { TtsProviderId } from '../../lib/tts/types';
import { generateTtsAsset, ttsCapabilities } from '../tts/index.js';

export interface NarrationVoiceLineRequest {
  id?: string;
  text: string;
}

export interface NarrationVoiceLineResult {
  id?: string;
  text: string;
  ttsAssetId: string;
  durationMs: number;
}

export interface NarrationVoiceProgress {
  completed: number;
  total: number;
  lineId?: string;
}

export interface SynthesizeNarrationOptions {
  /** Defaults to the first configured provider. */
  provider?: TtsProviderId;
  voiceId?: string;
  projectId?: string;
  label?: string;
  onProgress?: (progress: NarrationVoiceProgress) => void;
}

export interface SynthesizeNarrationResult {
  lines: NarrationVoiceLineResult[];
  warnings: string[];
  provider: TtsProviderId;
}

/** First provider the TTS core reports as available, if any. */
export function availableNarrationProvider(): TtsProviderId | null {
  return ttsCapabilities()[0]?.provider ?? null;
}

export async function synthesizeNarrationLines(
  lines: NarrationVoiceLineRequest[],
  options: SynthesizeNarrationOptions = {},
): Promise<SynthesizeNarrationResult> {
  const provider = options.provider ?? availableNarrationProvider();
  if (!provider) {
    throw new Error(
      'No speech provider is configured. Add a TTS provider key in Settings.',
    );
  }

  const results: NarrationVoiceLineResult[] = [];
  const warnings: string[] = [];
  let completed = 0;

  // Sequential on purpose: providers rate-limit per key, and script order is
  // the order the user hears. A failed line names itself in the error.
  for (const line of lines) {
    const text = line.text?.trim();
    if (!text) {
      warnings.push(
        `Line "${line.id ?? '(unnamed)'}" has no text and was skipped.`,
      );
      continue;
    }

    const asset = await generateTtsAsset({
      provider,
      ...(options.voiceId ? { voiceId: options.voiceId } : {}),
      text,
      label: options.label ?? 'Trace narration',
      origin: 'trace',
      originId: line.id ?? null,
      ...(options.projectId ? { projectId: options.projectId } : {}),
      reuse: true,
    });

    if (asset.durationMs === null || asset.durationMs <= 0) {
      throw new Error(
        `Line "${line.id ?? text.slice(0, 40)}" was synthesized without a ` +
          'measurable duration. Re-generate that line before fitting the timeline.',
      );
    }

    results.push({
      ...(line.id ? { id: line.id } : {}),
      text,
      ttsAssetId: asset.id,
      durationMs: asset.durationMs,
    });
    completed += 1;
    options.onProgress?.({
      completed,
      total: lines.length,
      ...(line.id ? { lineId: line.id } : {}),
    });
  }

  return { lines: results, warnings, provider };
}