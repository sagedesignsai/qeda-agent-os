/**
 * __tests__/tts-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The TTS row is the bridge between a file on disk and a URL the renderer can
 * play. These tests protect the two rules that make that safe:
 *
 *   • A public asset never carries `path` or `cacheKey`.
 *   • Deleting hides an asset immediately but does not break cache reuse for a
 *     future identical request.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  findTtsAssetByCacheKey,
  getTtsAsset,
  insertTtsAsset,
  listTtsAssets,
  softDeleteTtsAsset,
  toPublicTtsAsset,
  touchTtsAsset,
  type TtsAssetRecord,
} from '../main/tts/store';

function record(overrides: Partial<TtsAssetRecord> = {}): TtsAssetRecord {
  return {
    id: 'asset-1',
    kind: 'speech',
    provider: 'deepgram',
    model: 'aura-2-thalia-en',
    voiceId: 'aura-2-thalia-en',
    voiceName: 'Thalia',
    text: 'Hello from the test suite.',
    charCount: 25,
    format: 'mp3',
    mimeType: 'audio/mpeg',
    bytes: 3,
    durationMs: 1_200,
    sampleRate: 24_000,
    bitrate: 48_000,
    speed: null,
    label: 'Test clip',
    projectId: null,
    origin: 'studio',
    originId: null,
    requestId: 'req-1',
    warnings: ['FORMAT_DOWNGRADED_FOR_LONGFORM:flac->mp3'],
    createdAt: 1_700_000_000,
    url: 'qeda-media://tts/asset-1',
    path: '/tmp/tts/asset-1.mp3',
    cacheKey: 'cache-1',
    pronunciations: [{ word: 'Qeda', ipa: 'ˈkeɪdə' }],
    accessedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('TTS asset store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    // @ts-expect-error reset test db
    useTestDatabase(null);
    db.close();
  });

  it('round-trips a record with its JSON columns', () => {
    insertTtsAsset(record());
    const stored = getTtsAsset('asset-1');

    expect(stored).toMatchObject({
      id: 'asset-1',
      provider: 'deepgram',
      format: 'mp3',
      durationMs: 1_200,
      cacheKey: 'cache-1',
      path: '/tmp/tts/asset-1.mp3',
    });
    expect(stored?.pronunciations).toEqual([
      { word: 'Qeda', ipa: 'ˈkeɪdə' },
    ]);
    expect(stored?.warnings).toHaveLength(1);
  });

  it('finds a live asset by cache key and touches access time', () => {
    insertTtsAsset(record());
    expect(findTtsAssetByCacheKey('cache-1')?.id).toBe('asset-1');

    touchTtsAsset('asset-1');
    expect(getTtsAsset('asset-1')?.accessedAt).toBeGreaterThan(0);
  });

  it('strips main-only fields from the public shape', () => {
    insertTtsAsset(record());
    const asset = toPublicTtsAsset(getTtsAsset('asset-1')!);

    expect(asset.url).toBe('qeda-media://tts/asset-1');
    expect(asset).not.toHaveProperty('path');
    expect(asset).not.toHaveProperty('cacheKey');
    expect(asset).not.toHaveProperty('pronunciations');
    expect(asset).not.toHaveProperty('deletedAt');
  });

  it('filters by provider, origin, kind and search text', () => {
    insertTtsAsset(record());
    insertTtsAsset(
      record({
        id: 'asset-2',
        kind: 'voice-preview',
        origin: 'settings',
        voiceId: 'aura-2-orpheus-en',
        voiceName: 'Orpheus',
        text: 'This is how I sound.',
        cacheKey: 'cache-2',
        path: '/tmp/tts/asset-2.mp3',
      }),
    );

    expect(listTtsAssets({ provider: 'deepgram' }).total).toBe(2);
    expect(listTtsAssets({ kind: 'speech' }).assets.map((a) => a.id)).toEqual([
      'asset-1',
    ]);
    expect(listTtsAssets({ origin: 'settings' }).total).toBe(1);
    expect(listTtsAssets({ search: 'Orpheus' }).assets[0]?.id).toBe('asset-2');
    expect(listTtsAssets({ search: 'missing' }).total).toBe(0);
  });

  it('soft-deletes without destroying the row or its file record', () => {
    insertTtsAsset(record());

    expect(softDeleteTtsAsset('asset-1')).toBe(true);
    expect(softDeleteTtsAsset('asset-1')).toBe(false);
    expect(getTtsAsset('asset-1')).toBeNull();
    expect(getTtsAsset('asset-1', { includeDeleted: true })?.path).toBe(
      '/tmp/tts/asset-1.mp3',
    );
    expect(listTtsAssets().total).toBe(0);
    expect(findTtsAssetByCacheKey('cache-1')).toBeNull();
  });

  it('allows a new row to reuse a deleted cache key', () => {
    insertTtsAsset(record());
    softDeleteTtsAsset('asset-1');

    expect(() =>
      insertTtsAsset(
        record({
          id: 'asset-3',
          cacheKey: 'cache-1',
          path: '/tmp/tts/asset-3.mp3',
        }),
      ),
    ).not.toThrow();
    expect(findTtsAssetByCacheKey('cache-1')?.id).toBe('asset-3');
  });
});
