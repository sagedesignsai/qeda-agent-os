/**
 * lib/tts/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The provider-agnostic TTS contract shared by the main-process engine and every
 * renderer consumer (chat, Studio, Motion).
 *
 * Nothing here touches Node or Electron. The main process owns keys, HTTP and
 * files; the renderer only ever sees ids, metadata and `qeda-media://` URLs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TtsProviderId = 'deepgram' | 'elevenlabs' | 'cartesia';

export type TtsFormat = 'mp3' | 'wav' | 'opus' | 'flac' | 'aac';

export type TtsOrigin =
  | 'library'
  | 'chat'
  | 'studio'
  | 'motion'
  | 'trace'
  | 'settings'
  | 'api';

export type TtsAssetKind = 'speech' | 'voice-preview';

export interface TtsVoice {
  id: string;
  provider: TtsProviderId;
  name: string;
  /** Provider model family, e.g. `aura-2` or `aura`. */
  family: string;
  language: string;
  locale: string;
  gender?: string;
  age?: string;
  accent?: string;
  tags: string[];
  useCases: string[];
  /** Vendor-hosted sample. Auditioning costs nothing. */
  previewUrl?: string;
  avatarUrl?: string;
  color?: string;
  legacy?: boolean;
}

export interface TtsCapabilities {
  provider: TtsProviderId;
  formats: TtsFormat[];
  maxChars: number;
  speed?: { min: number; max: number; step: number };
  pronunciation: boolean;
  pauses: boolean;
  /** True only once the core exposes a streaming API. */
  streaming: boolean;
  customVoices: boolean;
}

export interface TtsPronunciation {
  word: string;
  ipa: string;
}

export interface TtsGenerateRequest {
  /**
   * Client-supplied id used to correlate `tts:progress` events and to cancel.
   * The engine generates one when omitted, but such a job is not cancellable.
   */
  requestId?: string;
  provider: TtsProviderId;
  voiceId?: string;
  text: string;
  format?: TtsFormat;
  sampleRate?: number;
  bitrate?: number;
  speed?: number;
  pronunciations?: TtsPronunciation[];
  label?: string;
  projectId?: string | null;
  origin?: TtsOrigin;
  originId?: string | null;
  /** Reuse a cached asset for identical text/voice/params. Default true. */
  reuse?: boolean;
  /** Deepgram Model Improvement Program opt-out. Default false. */
  mipOptOut?: boolean;
}

export interface TtsAsset {
  id: string;
  kind: TtsAssetKind;
  provider: TtsProviderId;
  model: string;
  voiceId: string;
  voiceName?: string;
  text: string;
  charCount: number;
  format: TtsFormat;
  mimeType: string;
  bytes: number;
  durationMs: number | null;
  sampleRate: number | null;
  bitrate: number | null;
  speed: number | null;
  label: string | null;
  projectId: string | null;
  origin: TtsOrigin;
  originId: string | null;
  requestId: string | null;
  warnings: string[];
  createdAt: number;
  /** `qeda-media://tts/<id>` — seekable playback without exposing a path. */
  url: string;
}

export interface TtsProgress {
  requestId: string;
  phase: 'resolving' | 'chunk' | 'stitch' | 'saving';
  chunkIndex?: number;
  chunkTotal?: number;
  charsDone?: number;
  charsTotal?: number;
}

export interface TtsEstimate {
  chars: number;
  chunks: number;
  maxChars: number;
  format: TtsFormat;
  willFallback: boolean;
  fallbackFrom?: TtsFormat;
}

export interface TtsAssetQuery {
  provider?: TtsProviderId;
  kind?: TtsAssetKind;
  origin?: TtsOrigin;
  projectId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TtsAssetPage {
  assets: TtsAsset[];
  total: number;
}

export interface TtsVoiceCatalog {
  voices: TtsVoice[];
  fetchedAt: number | null;
  source: 'live' | 'cache' | 'bundled';
}

export interface TtsVoiceQuery {
  provider?: TtsProviderId;
  language?: string;
  gender?: string;
  family?: string;
  search?: string;
  /** Bypass the on-disk TTL and fetch from the provider now. */
  refresh?: boolean;
}

export type TtsErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH_FAILED'
  | 'CREDITS_EXHAUSTED'
  | 'PROVIDER_UNSUPPORTED'
  | 'INVALID_REQUEST'
  | 'VOICE_UNKNOWN'
  | 'TEXT_TOO_LONG'
  | 'FORMAT_UNSUPPORTED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'ABORTED'
  | 'IO_ERROR'
  | 'STITCH_FAILED';

export type TtsResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TtsErrorCode; error: string; requestId?: string };

export interface TtsExportRequest {
  id: string;
  filename?: string;
}

export interface TtsExportResult {
  saved: boolean;
  path?: string;
  error?: string;
}

export const TTS_PROVIDERS: TtsProviderId[] = [
  'deepgram',
  'elevenlabs',
  'cartesia',
];

/** Well-known public default voices; callers may override via `voiceId`. */
export const DEFAULT_TTS_VOICE: Record<TtsProviderId, string> = {
  deepgram: 'aura-2-thalia-en',
  elevenlabs: 'JBFqnCBsd6RMkjVDRZzb', // "George"
  cartesia: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
};

export const DEFAULT_TTS_FORMAT: TtsFormat = 'mp3';

/** Provider-native sample rate/bitrate defaults. */
export const DEFAULT_TTS_SAMPLE_RATE = 24_000;

export const TTS_FORMAT_MIME: Record<TtsFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

export const TTS_FORMAT_EXTENSION: Record<TtsFormat, string> = {
  mp3: '.mp3',
  wav: '.wav',
  opus: '.ogg',
  flac: '.flac',
  aac: '.aac',
};

/** Formats that can be byte/PCM-stitched without ffmpeg. */
export const STITCHABLE_TTS_FORMATS: TtsFormat[] = ['mp3', 'wav'];

export interface TtsSettings {
  provider?: TtsProviderId;
  defaults?: Partial<
    Record<
      TtsProviderId,
      {
        voiceId?: string;
        format?: TtsFormat;
        speed?: number;
      }
    >
  >;
}
