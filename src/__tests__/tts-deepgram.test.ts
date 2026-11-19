/**
 * __tests__/tts-deepgram.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Deepgram adapter is pure HTTP, so these tests are about the two things
 * that are easy to get silently wrong:
 *
 *   • `encoding` must always be present. Deepgram's docs disagree about the
 *     default, and guessing yields WAV bytes labelled `audio/mpeg`.
 *   • Format-specific parameters must not leak across formats — MP3 fixes its
 *     own sample rate, linear16 accepts only a small set of them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildDeepgramSpeakUrl,
  deepgramSynthesize,
  DEEPGRAM_CAPABILITIES,
} from '../main/tts/providers/deepgram';
import { loadDeepgramVoices } from '../main/tts/voices';
import { setTtsRootForTests } from '../main/tts/paths';
import { ServiceHttpError } from '../main/services/http';

interface Call {
  url: string;
  init?: RequestInit;
}

function binaryResponse(
  bytes: Uint8Array,
  contentType = 'audio/mpeg',
  headers: Record<string, string> = {},
): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer,
    headers: new Headers({ 'content-type': contentType, ...headers }),
  } as unknown as Response;
}

function errorResponse(status: number, payload: unknown): Response {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

function recorder(response: Response, calls: Call[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
}

describe('buildDeepgramSpeakUrl', () => {
  it('always sends an explicit encoding and MP3 bitrate', () => {
    const url = new URL(
      buildDeepgramSpeakUrl({
        apiKey: 'k',
        text: 'hello',
        voiceId: 'aura-2-thalia-en',
        format: { format: 'mp3', bitrate: 32_000 },
      }),
    );

    expect(url.pathname).toBe('/v1/speak');
    expect(url.searchParams.get('model')).toBe('aura-2-thalia-en');
    expect(url.searchParams.get('encoding')).toBe('mp3');
    expect(url.searchParams.get('bit_rate')).toBe('32000');
    expect(url.searchParams.has('sample_rate')).toBe(false);
  });

  it('uses linear16 + container for WAV and validates the sample rate', () => {
    const url = new URL(
      buildDeepgramSpeakUrl({
        apiKey: 'k',
        text: 'hello',
        voiceId: 'aura-2-thalia-en',
        format: { format: 'wav', sampleRate: 16_000 },
      }),
    );
    expect(url.searchParams.get('encoding')).toBe('linear16');
    expect(url.searchParams.get('container')).toBe('wav');
    expect(url.searchParams.get('sample_rate')).toBe('16000');

    const fallback = new URL(
      buildDeepgramSpeakUrl({
        apiKey: 'k',
        text: 'hello',
        voiceId: 'aura-2-thalia-en',
        format: { format: 'wav', sampleRate: 44_100 },
      }),
    );
    expect(fallback.searchParams.get('sample_rate')).toBe('24000');
  });

  it('rejects speeds outside the Aura range', () => {
    expect(() =>
      buildDeepgramSpeakUrl({
        apiKey: 'k',
        text: 'hello',
        voiceId: 'aura-2-thalia-en',
        format: { format: 'mp3' },
        speed: 2,
      }),
    ).toThrow(/speed must be between 0.7 and 1.5/);
  });
});

describe('deepgramSynthesize', () => {
  it('posts JSON with a Token header and returns response metadata', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      binaryResponse(new Uint8Array([1, 2, 3]), 'audio/mpeg', {
        'dg-model-name': 'aura-2-thalia-en',
        'dg-request-id': 'req_123',
        'dg-char-count': '5',
        'dg-warnings': 'A, B',
      }),
      calls,
    );

    const audio = await deepgramSynthesize({
      apiKey: 'secret',
      text: 'hello',
      voiceId: 'aura-2-thalia-en',
      format: { format: 'mp3' },
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(new Headers(calls[0]!.init?.headers).get('authorization')).toBe(
      'Token secret',
    );
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ text: 'hello' });
    expect(audio).toMatchObject({
      mimeType: 'audio/mpeg',
      model: 'aura-2-thalia-en',
      requestId: 'req_123',
      charCount: 5,
      warnings: ['A', 'B'],
    });
  });

  it('surfaces provider failures as ServiceHttpError with a status', async () => {
    const fetchImpl = recorder(
      errorResponse(401, { err_msg: 'Invalid credentials' }),
      [],
    );

    await expect(
      deepgramSynthesize({
        apiKey: 'bad',
        text: 'hello',
        voiceId: 'aura-2-thalia-en',
        format: { format: 'mp3' },
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: 'ServiceHttpError',
      status: 401,
    } satisfies Partial<ServiceHttpError>);
  });
});

describe('loadDeepgramVoices', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-tts-voices-'));
    setTtsRootForTests(root);
  });

  afterEach(async () => {
    setTtsRootForTests(null);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('normalizes the models endpoint and excludes Flux voices', async () => {
    const models = {
      tts: [
        {
          name: 'thalia',
          canonical_name: 'aura-2-thalia-en',
          architecture: 'aura-2',
          languages: ['en', 'en-US'],
          metadata: {
            display_name: 'Thalia',
            accent: 'American',
            age: 'Adult',
            tags: ['feminine', 'clear'],
            use_cases: ['Customer Service'],
            sample: 'https://example.com/thalia.wav',
            color: '#123456',
          },
        },
        {
          name: 'orion',
          canonical_name: 'aura-orion-en',
          architecture: 'aura',
          languages: ['en', 'en-US'],
          metadata: { tags: ['masculine'] },
        },
        {
          name: 'flux',
          canonical_name: 'flux-general-en',
          architecture: 'flux',
          languages: ['en'],
        },
      ],
    };

    // `/v1/models` is JSON, unlike the binary speak endpoint.
    const catalog = await loadDeepgramVoices({
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => models,
        headers: new Headers(),
      })) as unknown as typeof fetch,
    });

    expect(catalog.source).toBe('live');
    expect(catalog.voices.map((voice) => voice.id)).toEqual([
      'aura-2-thalia-en',
      'aura-orion-en',
    ]);
    expect(catalog.voices[0]).toMatchObject({
      name: 'Thalia',
      gender: 'feminine',
      locale: 'en-US',
      useCases: ['Customer Service'],
      previewUrl: 'https://example.com/thalia.wav',
    });
    expect(catalog.voices[1]).toMatchObject({ legacy: true });

    // The live result is cached, so a second call needs no network.
    const cached = await loadDeepgramVoices({
      fetchImpl: (async () => {
        throw new Error('network should not be used');
      }) as unknown as typeof fetch,
    });
    expect(cached.source).toBe('cache');
    expect(cached.voices).toHaveLength(2);
  });

  it('falls back to the bundled snapshot when the network fails', async () => {
    const catalog = await loadDeepgramVoices({
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    expect(catalog.source).toBe('bundled');
    expect(catalog.voices.length).toBeGreaterThan(50);
    expect(DEEPGRAM_CAPABILITIES.maxChars).toBe(2_000);
  });
});
