/**
 * main/tts/providers/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The adapter contract each speech provider implements.
 *
 * Adapters are deliberately pure HTTP: they never resolve keys, touch disk,
 * persist assets or know about progress. That keeps them unit-testable with an
 * injected `fetchImpl`, the same convention as `main/services/*`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  TtsCapabilities,
  TtsFormat,
  TtsPronunciation,
  TtsProviderId,
} from '../../../lib/tts/types.js';

export interface TtsFormatSpec {
  format: TtsFormat;
  sampleRate?: number;
  bitrate?: number;
}

export interface ProviderSynthesisInput {
  apiKey: string;
  text: string;
  voiceId: string;
  format: TtsFormatSpec;
  speed?: number;
  /** Already applied to `text` for providers that use inline controls. */
  pronunciations?: TtsPronunciation[];
  mipOptOut?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface ProviderAudio {
  bytes: Uint8Array;
  mimeType: string;
  model: string;
  requestId?: string;
  warnings: string[];
  charCount?: number;
}

export interface TtsProviderAdapter {
  id: TtsProviderId;
  capabilities: TtsCapabilities;
  synthesize(input: ProviderSynthesisInput): Promise<ProviderAudio>;
}
