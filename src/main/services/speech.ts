/**
 * services/speech.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Speech clients:
 *   • synthesizeSpeech   – text → audio via ElevenLabs, Deepgram (Aura) or
 *                          Cartesia (Sonic)
 *   • deepgramTranscribe – audio → text via Deepgram (Nova)
 *
 * Audio comes back as raw bytes so the caller decides how to surface it (the
 * agent tool base64-encodes it into a data URL the renderer can play).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requestBinary, requestJson } from './http.js';

export type TtsProvider = 'elevenlabs' | 'deepgram' | 'cartesia';

export const TTS_PROVIDERS: TtsProvider[] = [
  'elevenlabs',
  'deepgram',
  'cartesia',
];

/** Well-known public default voices; callers may override via `voice`. */
const DEFAULT_VOICE: Record<TtsProvider, string> = {
  elevenlabs: 'JBFqnCBsd6RMkjVDRZzb', // "George"
  deepgram: 'aura-2-thalia-en',
  cartesia: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
};

export interface TtsRequest {
  provider: TtsProvider;
  text: string;
  apiKey: string;
  /** Provider-specific voice id / model name. */
  voice?: string;
  fetchImpl?: typeof fetch;
}

export interface SpeechAudio {
  provider: TtsProvider;
  contentType: string;
  bytes: Uint8Array;
}

export async function synthesizeSpeech(req: TtsRequest): Promise<SpeechAudio> {
  const voice = req.voice?.trim() || DEFAULT_VOICE[req.provider];

  switch (req.provider) {
    case 'elevenlabs': {
      const { bytes, contentType } = await requestBinary({
        service: 'ElevenLabs',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
        headers: { 'xi-api-key': req.apiKey, Accept: 'audio/mpeg' },
        body: { text: req.text, model_id: 'eleven_multilingual_v2' },
        fetchImpl: req.fetchImpl,
      });
      return {
        provider: 'elevenlabs',
        contentType: contentType || 'audio/mpeg',
        bytes,
      };
    }
    case 'deepgram': {
      const { bytes, contentType } = await requestBinary({
        service: 'Deepgram',
        url: `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}`,
        headers: { Authorization: `Token ${req.apiKey}`, Accept: 'audio/mpeg' },
        body: { text: req.text },
        fetchImpl: req.fetchImpl,
      });
      return {
        provider: 'deepgram',
        contentType: contentType || 'audio/mpeg',
        bytes,
      };
    }
    case 'cartesia': {
      const { bytes, contentType } = await requestBinary({
        service: 'Cartesia',
        url: 'https://api.cartesia.ai/tts/bytes',
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
          'Cartesia-Version': '2024-06-10',
          Accept: 'audio/mpeg',
        },
        body: {
          model_id: 'sonic-2',
          transcript: req.text,
          voice: { mode: 'id', id: voice },
          output_format: {
            container: 'mp3',
            sample_rate: 44100,
            bit_rate: 128000,
          },
        },
        fetchImpl: req.fetchImpl,
      });
      return {
        provider: 'cartesia',
        contentType: contentType || 'audio/mpeg',
        bytes,
      };
    }
  }
}

export interface TranscribeRequest {
  apiKey: string;
  audio: Uint8Array;
  contentType: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface DeepgramListenResponse {
  results?: {
    channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
  };
}

/** Transcribe an audio buffer with Deepgram Nova. Returns plain text. */
export async function deepgramTranscribe(
  req: TranscribeRequest,
): Promise<{ text: string }> {
  const model = req.model ?? 'nova-3';
  const data = await requestJson<DeepgramListenResponse>({
    service: 'Deepgram',
    url: `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&smart_format=true&punctuate=true`,
    method: 'POST',
    headers: { Authorization: `Token ${req.apiKey}` },
    binaryBody: req.audio,
    contentType: req.contentType,
    fetchImpl: req.fetchImpl,
    timeoutMs: 120_000,
  });

  const transcript =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  return { text: transcript };
}
