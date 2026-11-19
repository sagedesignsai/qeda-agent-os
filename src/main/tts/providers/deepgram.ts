/**
 * main/tts/providers/deepgram.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deepgram Aura text-to-speech (REST `/v1/speak`).
 *
 * Two details are load-bearing:
 *   1. `encoding` is ALWAYS sent explicitly. Deepgram's reference and media
 *      output docs disagree about defaults, and guessing yields WAV bytes with
 *      an `audio/mpeg` content-type.
 *   2. MP3 fixes its own sample rate (22050 Hz), so sending `sample_rate` with
 *      `encoding=mp3` is wrong. The format table below encodes that.
 *
 * The adapter returns raw bytes plus response metadata. Chunking, stitching,
 * persistence and error-code mapping belong to the engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requestBinary } from '../../services/http.js';
import {
  DEFAULT_TTS_SAMPLE_RATE,
  TTS_FORMAT_MIME,
  type TtsCapabilities,
  type TtsFormat,
} from '../../../lib/tts/types.js';
import type {
  ProviderAudio,
  ProviderSynthesisInput,
  TtsProviderAdapter,
} from './types.js';

const DEEPGRAM_SPEAK_URL = 'https://api.deepgram.com/v1/speak';

export const DEEPGRAM_CAPABILITIES: TtsCapabilities = {
  provider: 'deepgram',
  formats: ['mp3', 'wav', 'opus', 'flac', 'aac'],
  maxChars: 2_000,
  speed: { min: 0.7, max: 1.5, step: 0.05 },
  pronunciation: true,
  pauses: false,
  streaming: false,
  customVoices: false,
};

/** Supported bitrates for MP3; Deepgram rejects anything else. */
const MP3_BITRATES = new Set([32_000, 48_000]);

/** Supported linear16 sample rates. */
const WAV_SAMPLE_RATES = new Set([8_000, 16_000, 24_000, 32_000, 48_000]);

function resolveBitrate(format: TtsFormat, requested?: number): number {
  if (format !== 'mp3') return 0;
  if (requested && MP3_BITRATES.has(requested)) return requested;
  return 48_000;
}

function resolveSampleRate(requested?: number): number {
  if (requested && WAV_SAMPLE_RATES.has(requested)) return requested;
  return DEFAULT_TTS_SAMPLE_RATE;
}

export function buildDeepgramSpeakUrl(input: ProviderSynthesisInput): string {
  const params = new URLSearchParams();
  params.set('model', input.voiceId);

  switch (input.format.format) {
    case 'mp3':
      params.set('encoding', 'mp3');
      params.set('bit_rate', String(resolveBitrate('mp3', input.format.bitrate)));
      break;
    case 'wav':
      params.set('encoding', 'linear16');
      params.set('container', 'wav');
      params.set('sample_rate', String(resolveSampleRate(input.format.sampleRate)));
      break;
    case 'opus':
      params.set('encoding', 'opus');
      params.set('container', 'ogg');
      break;
    case 'flac':
      params.set('encoding', 'flac');
      break;
    case 'aac':
      params.set('encoding', 'aac');
      break;
  }

  if (typeof input.speed === 'number' && Number.isFinite(input.speed)) {
    const { min, max } = DEEPGRAM_CAPABILITIES.speed!;
    if (input.speed < min || input.speed > max) {
      throw new Error(
        `Deepgram speed must be between ${min} and ${max} (received ${input.speed}).`,
      );
    }
    params.set('speed', String(input.speed));
  }

  if (input.mipOptOut) params.set('mip_opt_out', 'true');

  return `${DEEPGRAM_SPEAK_URL}?${params.toString()}`;
}

function warningsFromHeaders(headers: Headers): string[] {
  const warnings = headers.get('dg-warnings');
  if (!warnings) return [];
  return warnings
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function deepgramSynthesize(
  input: ProviderSynthesisInput,
): Promise<ProviderAudio> {
  const url = buildDeepgramSpeakUrl(input);
  const { bytes, contentType, headers } = await requestBinary({
    service: 'Deepgram',
    url,
    method: 'POST',
    headers: {
      Authorization: `Token ${input.apiKey}`,
      Accept: TTS_FORMAT_MIME[input.format.format],
    },
    body: { text: input.text },
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });

  const charCount = Number(headers.get('dg-char-count'));
  return {
    bytes,
    mimeType:
      contentType || TTS_FORMAT_MIME[input.format.format] || 'audio/mpeg',
    model: headers.get('dg-model-name') ?? input.voiceId,
    ...(headers.get('dg-request-id')
      ? { requestId: headers.get('dg-request-id') as string }
      : {}),
    warnings: warningsFromHeaders(headers),
    ...(Number.isFinite(charCount) ? { charCount } : {}),
  };
}

export const deepgramAdapter: TtsProviderAdapter = {
  id: 'deepgram',
  capabilities: DEEPGRAM_CAPABILITIES,
  synthesize: deepgramSynthesize,
};
