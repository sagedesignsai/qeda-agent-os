/**
 * main/tts/store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite persistence for generated speech.
 *
 * The engine writes the audio file first and then records this row, so a row
 * always points at a file that exists. `path` and `cacheKey` stay main-side:
 * `toPublicTtsAsset()` is the only shape that crosses IPC, and it carries
 * `qeda-media://tts/<id>` instead of a filesystem location.
 *
 * Deletion is soft (`deleted_at`) so a Studio timeline holding an asset id does
 * not lose its source mid-session; a future purge pass reclaims the bytes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from '../db/client.js';
import { ttsMediaUrl } from '../../lib/tts/media.js';
import type {
  TtsAsset,
  TtsAssetKind,
  TtsAssetPage,
  TtsAssetQuery,
  TtsFormat,
  TtsOrigin,
  TtsProviderId,
  TtsPronunciation,
} from '../../lib/tts/types.js';

export interface TtsAssetRecord extends TtsAsset {
  /** Absolute path of the audio file. Main-process only. */
  path: string;
  /** Content hash used to reuse identical generations. */
  cacheKey: string;
  pronunciations: TtsPronunciation[];
  accessedAt: number | null;
  deletedAt: number | null;
}

interface TtsAssetRow {
  id: string;
  kind: string;
  provider: string;
  model: string;
  voice_id: string;
  voice_name: string | null;
  text: string;
  char_count: number;
  format: string;
  mime_type: string;
  path: string;
  bytes: number;
  duration_ms: number | null;
  sample_rate: number | null;
  bitrate: number | null;
  speed: number | null;
  pronunciations_json: string | null;
  warnings_json: string | null;
  request_id: string | null;
  cache_key: string;
  label: string | null;
  project_id: string | null;
  origin: string;
  origin_id: string | null;
  created_at: number;
  accessed_at: number | null;
  deleted_at: number | null;
}

function parseJsonSafe<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: TtsAssetRow): TtsAssetRecord {
  return {
    id: row.id,
    kind: (row.kind as TtsAssetKind) || 'speech',
    provider: row.provider as TtsProviderId,
    model: row.model,
    voiceId: row.voice_id,
    ...(row.voice_name ? { voiceName: row.voice_name } : {}),
    text: row.text,
    charCount: row.char_count,
    format: row.format as TtsFormat,
    mimeType: row.mime_type,
    bytes: row.bytes,
    durationMs: row.duration_ms,
    sampleRate: row.sample_rate,
    bitrate: row.bitrate,
    speed: row.speed,
    label: row.label,
    projectId: row.project_id,
    origin: row.origin as TtsOrigin,
    originId: row.origin_id,
    requestId: row.request_id,
    warnings: parseJsonSafe<string[]>(row.warnings_json, []),
    createdAt: row.created_at,
    url: ttsMediaUrl(row.id),
    path: row.path,
    cacheKey: row.cache_key,
    pronunciations: parseJsonSafe<TtsPronunciation[]>(
      row.pronunciations_json,
      [],
    ),
    accessedAt: row.accessed_at,
    deletedAt: row.deleted_at,
  };
}

/** Strip main-only fields and attach the playable URL. */
export function toPublicTtsAsset(record: TtsAssetRecord): TtsAsset {
  const {
    path: _path,
    cacheKey: _cacheKey,
    pronunciations: _pronunciations,
    accessedAt: _accessedAt,
    deletedAt: _deletedAt,
    ...asset
  } = record;
  return asset;
}

export function insertTtsAsset(record: TtsAssetRecord): void {
  getDb()
    .prepare(
      `INSERT INTO tts_assets (
         id, kind, provider, model, voice_id, voice_name, text, char_count,
         format, mime_type, path, bytes, duration_ms, sample_rate, bitrate,
         speed, pronunciations_json, warnings_json, request_id, cache_key,
         label, project_id, origin, origin_id, created_at, accessed_at,
         deleted_at
       ) VALUES (
         @id, @kind, @provider, @model, @voice_id, @voice_name, @text,
         @char_count, @format, @mime_type, @path, @bytes, @duration_ms,
         @sample_rate, @bitrate, @speed, @pronunciations_json,
         @warnings_json, @request_id, @cache_key, @label, @project_id,
         @origin, @origin_id, @created_at, @accessed_at, @deleted_at
       )`,
    )
    .run({
      id: record.id,
      kind: record.kind,
      provider: record.provider,
      model: record.model,
      voice_id: record.voiceId,
      voice_name: record.voiceName ?? null,
      text: record.text,
      char_count: record.charCount,
      format: record.format,
      mime_type: record.mimeType,
      path: record.path,
      bytes: record.bytes,
      duration_ms: record.durationMs,
      sample_rate: record.sampleRate,
      bitrate: record.bitrate,
      speed: record.speed,
      pronunciations_json:
        record.pronunciations.length > 0
          ? JSON.stringify(record.pronunciations)
          : null,
      warnings_json:
        record.warnings.length > 0 ? JSON.stringify(record.warnings) : null,
      request_id: record.requestId,
      cache_key: record.cacheKey,
      label: record.label,
      project_id: record.projectId,
      origin: record.origin,
      origin_id: record.originId,
      created_at: record.createdAt,
      accessed_at: record.accessedAt,
      deleted_at: record.deletedAt,
    });
}

/** The live (non-deleted) asset generated from identical inputs, if any. */
export function findTtsAssetByCacheKey(key: string): TtsAssetRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM tts_assets
       WHERE cache_key = ? AND deleted_at IS NULL
       ORDER BY created_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get(key) as TtsAssetRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getTtsAsset(
  id: string,
  opts: { includeDeleted?: boolean } = {},
): TtsAssetRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM tts_assets
       WHERE id = ? ${opts.includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
    )
    .get(id) as TtsAssetRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function listTtsAssets(
  query: TtsAssetQuery = {},
): TtsAssetPage {
  const where: string[] = ['deleted_at IS NULL'];
  const params: Record<string, unknown> = {};

  if (query.provider) {
    where.push('provider = @provider');
    params.provider = query.provider;
  }
  if (query.kind) {
    where.push('kind = @kind');
    params.kind = query.kind;
  }
  if (query.origin) {
    where.push('origin = @origin');
    params.origin = query.origin;
  }
  if (query.projectId) {
    where.push('project_id = @projectId');
    params.projectId = query.projectId;
  }
  const search = query.search?.trim();
  if (search) {
    where.push(
      `(label LIKE @search OR text LIKE @search OR voice_name LIKE @search)`,
    );
    params.search = `%${search}%`;
  }

  const limit = Number.isFinite(query.limit)
    ? Math.max(1, Math.min(200, Math.floor(query.limit!)))
    : 50;
  const offset = Number.isFinite(query.offset)
    ? Math.max(0, Math.floor(query.offset!))
    : 0;

  const clause = where.join(' AND ');
  const db = getDb();
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM tts_assets WHERE ${clause}`)
      .get(params) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `SELECT * FROM tts_assets
       WHERE ${clause}
       ORDER BY created_at DESC, rowid DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as TtsAssetRow[];

  return { assets: rows.map((row) => toPublicTtsAsset(rowToRecord(row))), total };
}

/** Record a playback reuse without rewriting the whole row. */
export function touchTtsAsset(id: string): void {
  getDb()
    .prepare(`UPDATE tts_assets SET accessed_at = unixepoch() WHERE id = ?`)
    .run(id);
}

/**
 * Hide an asset from listings. The file is intentionally left in place: a
 * renderer may still be holding the old `qeda-media://` URL, and the same bytes
 * can be reused if the same request arrives before a purge.
 */
export function softDeleteTtsAsset(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE tts_assets SET deleted_at = unixepoch()
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(id);
  return result.changes > 0;
}
