/**
 * __tests__/tts-engine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The engine is where a request becomes a file, a row and (optionally) a
 * reused asset. These tests cover the promises a Studio dialog depends on:
 *
 *   • identical input costs zero network calls the second time;
 *   • progress arrives in order and includes chunk counts;
 *   • cancelling leaves neither a row nor a file;
 *   • a long unstitchable format comes back as MP3 with a visible warning;
 *   • failures carry distinct machine-readable codes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  cancelTts,
  estimateTts,
  generateTtsAsset,
  TtsError,
} from '../main/tts/engine';
import { setTtsRootForTests } from '../main/tts/paths';
import { getTtsAsset, listTtsAssets } from '../main/tts/store';
import type { TtsGenerateRequest, TtsProgress } from '../lib/tts/types';

interface Call {
  url: string;
  init?: RequestInit;
}

function audioResponse(bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x64])): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer,
    headers: new Headers({
      'content-type': 'audio/mpeg',
      'dg-model-name': 'aura-2-thalia-en',
    }),
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

function recorder(
  respond: () => Response | Promise<Response>,
  calls: Call[],
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
}

const REQUEST: TtsGenerateRequest = {
  provider: 'deepgram',
  voiceId: 'aura-2-thalia-en',
  text: 'A short line of speech.',
  format: 'mp3',
  origin: 'studio',
};

describe('TTS engine', () => {
  let db: Database.Database;
  let root: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-tts-engine-'));
    setTtsRootForTests(root);
    process.env.DEEPGRAM_API_KEY = 'test-key';
  });

  afterEach(async () => {
    delete process.env.DEEPGRAM_API_KEY;
    setTtsRootForTests(null);
    // @ts-expect-error reset test db
    useTestDatabase(null);
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reuses an identical generation without another request', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(audioResponse, calls);

    const first = await generateTtsAsset(REQUEST, { fetchImpl });
    const second = await generateTtsAsset(REQUEST, { fetchImpl });

    expect(calls).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.url).toBe(`qeda-media://tts/${first.id}`);
    expect(second.bytes).toBe(first.bytes);
    expect(listTtsAssets().total).toBe(1);
    expect(await fs.readFile(getTtsAsset(first.id)!.path)).toHaveLength(
      first.bytes,
    );
  });

  it('bypasses the cache when reuse is false', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(audioResponse, calls);

    await generateTtsAsset(REQUEST, { fetchImpl });
    await generateTtsAsset({ ...REQUEST, reuse: false }, { fetchImpl });

    expect(calls).toHaveLength(2);
    expect(listTtsAssets().total).toBe(2);
  });

  it('reports progress in order with chunk counts', async () => {
    const progress: TtsProgress[] = [];
    const fetchImpl = recorder(audioResponse, []);

    await generateTtsAsset(REQUEST, {
      fetchImpl,
      onProgress: (event) => progress.push(event),
    });

    expect(progress.map((event) => event.phase)).toEqual([
      'resolving',
      'chunk',
      'stitch',
      'saving',
    ]);
    expect(progress[1]).toMatchObject({
      chunkIndex: 1,
      chunkTotal: 1,
      charsTotal: REQUEST.text.length,
    });
    expect(new Set(progress.map((event) => event.requestId)).size).toBe(1);
  });

  it('cancels without leaving a row or a file', async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      })) as unknown as typeof fetch;

    const running = generateTtsAsset(
      { ...REQUEST, requestId: 'cancel-me' },
      { fetchImpl },
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(cancelTts('cancel-me')).toBe(true);

    await expect(running).rejects.toMatchObject({ code: 'ABORTED' });
    expect(listTtsAssets().total).toBe(0);
    const files = await fs.readdir(root).catch(() => [] as string[]);
    expect(files).toEqual([]);
  });

  it('downgrades an unstitchable long script to MP3 with a warning', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(audioResponse, calls);
    const text = 'word '.repeat(600).trim();

    const asset = await generateTtsAsset(
      { ...REQUEST, text, format: 'flac' },
      { fetchImpl },
    );

    expect(calls.length).toBeGreaterThan(1);
    expect(asset.format).toBe('mp3');
    expect(asset.warnings).toContain(
      'FORMAT_DOWNGRADED_FOR_LONGFORM:flac->mp3',
    );
    for (const call of calls) {
      expect(new URL(call.url).searchParams.get('encoding')).toBe('mp3');
    }
  });

  it('estimates chunks and the downgrade before synthesis', async () => {
    const estimate = await estimateTts({
      ...REQUEST,
      text: 'word '.repeat(600).trim(),
      format: 'aac',
    });

    expect(estimate.chunks).toBeGreaterThan(1);
    expect(estimate.format).toBe('mp3');
    expect(estimate.willFallback).toBe(true);
    expect(estimate.fallbackFrom).toBe('aac');
  });

  it('maps provider and request failures to distinct codes', async () => {
    await expect(
      generateTtsAsset(REQUEST, {
        fetchImpl: recorder(() => errorResponse(401, { err_msg: 'bad key' }), []),
      }),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });

    await expect(
      generateTtsAsset({ ...REQUEST, speed: 3 }, {
        fetchImpl: recorder(audioResponse, []),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    delete process.env.DEEPGRAM_API_KEY;
    await expect(
      generateTtsAsset(REQUEST, {
        fetchImpl: recorder(audioResponse, []),
      }),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('exposes the request id on the thrown error', async () => {
    const error = await generateTtsAsset(
      { ...REQUEST, requestId: 'req-42' },
      {
        fetchImpl: recorder(() => errorResponse(413, { err_msg: 'too long' }), []),
      },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TtsError);
    expect(error).toMatchObject({
      code: 'TEXT_TOO_LONG',
      requestId: 'req-42',
    });
  });
});
