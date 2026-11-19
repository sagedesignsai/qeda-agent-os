/**
 * main/tts/format.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve the format a request can actually be served in.
 *
 * Long text is synthesized in chunks. MP3 and WAV can be joined in-process;
 * Opus/FLAC/AAC cannot without a transcoder, so they downgrade to MP3 and the
 * asset records why. Silent downgrades are worse than a visible warning.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  STITCHABLE_TTS_FORMATS,
  type TtsCapabilities,
  type TtsFormat,
} from '../../lib/tts/types.js';

export interface ResolvedTtsFormat {
  format: TtsFormat;
  warning?: string;
}

export function resolveTtsFormat(
  requested: TtsFormat,
  chunkCount: number,
  capabilities: TtsCapabilities,
): ResolvedTtsFormat {
  if (!capabilities.formats.includes(requested)) {
    throw new Error(
      `${capabilities.provider} does not support ${requested}. Supported formats: ${capabilities.formats.join(', ')}.`,
    );
  }

  if (
    chunkCount > 1 &&
    !STITCHABLE_TTS_FORMATS.includes(requested)
  ) {
    return {
      format: 'mp3',
      warning: `FORMAT_DOWNGRADED_FOR_LONGFORM:${requested}->mp3`,
    };
  }

  return { format: requested };
}
