/**
 * db/studio-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite storage and domain models for Studio: Showcase Generator.
 *
 * Persists recording takes, mouse telemetry references, cuts, zoom keyframes,
 * captions, canvas effects, media overlays, styling presets, and social release
 * kits. Tied optionally to projects via project_id.
 *
 * The JSON-array fields (cuts/zooms/captions/effects/overlays) mirror the
 * existing zoom/caption convention rather than a normalized child table; the
 * timeline is a projection of these arrays, not their owner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from './client.js';
import type {
  StudioCut,
  StudioZoom,
  StudioCaption,
  StudioCaptionWord,
  StudioEffect,
  StudioOverlay,
  StudioStyling,
  StudioSocialKit,
  MouseTrackerEvent,
  StudioTake,
  StudioTakeSummary,
} from '../../lib/studio-types.js';
import { DEFAULT_STUDIO_STYLING } from '../../lib/studio-types.js';

export type {
  StudioCut,
  StudioZoom,
  StudioCaption,
  StudioCaptionWord,
  StudioEffect,
  StudioOverlay,
  StudioStyling,
  StudioSocialKit,
  MouseTrackerEvent,
  StudioTake,
  StudioTakeSummary,
};
export { DEFAULT_STUDIO_STYLING };

interface StudioTakeRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  title: string;
  description: string | null;
  source_type: string;
  source_name: string | null;
  duration_ms: number;
  video_path: string;
  audio_path: string | null;
  mouse_events_path: string | null;
  cuts_json: string | null;
  zooms_json: string | null;
  captions_json: string | null;
  effects_json: string | null;
  overlays_json: string | null;
  styling_json: string | null;
  social_kit_json: string | null;
  created_at: number;
  updated_at: number;
}

function parseJsonSafe<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToTake(row: StudioTakeRow): StudioTake {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    description: row.description,
    sourceType: (row.source_type as 'screen' | 'window') || 'screen',
    sourceName: row.source_name,
    durationMs: row.duration_ms,
    videoPath: row.video_path,
    audioPath: row.audio_path,
    mouseEventsPath: row.mouse_events_path,
    cuts: parseJsonSafe<StudioCut[]>(row.cuts_json, []),
    zooms: parseJsonSafe<StudioZoom[]>(row.zooms_json, []),
    captions: parseJsonSafe<StudioCaption[]>(row.captions_json, []),
    effects: parseJsonSafe<StudioEffect[]>(row.effects_json, []),
    overlays: parseJsonSafe<StudioOverlay[]>(row.overlays_json, []),
    styling: parseJsonSafe<StudioStyling>(
      row.styling_json,
      DEFAULT_STUDIO_STYLING,
    ),
    socialKit: parseJsonSafe<StudioSocialKit | null>(row.social_kit_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listStudioTakes(
  projectId?: string | null,
  limit = 50,
  offset = 0,
): StudioTakeSummary[] {
  const db = getDb();
  const pageSize = Number.isFinite(limit)
    ? Math.max(1, Math.min(100, Math.floor(limit)))
    : 50;
  const pageOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;
  const projection = `SELECT t.id, t.project_id, p.name AS project_name,
       t.title, t.description, t.source_type, t.source_name, t.duration_ms,
       CASE WHEN json_valid(t.cuts_json) THEN json_array_length(t.cuts_json)
            ELSE 0 END AS cut_count,
       CASE WHEN json_valid(t.zooms_json) THEN json_array_length(t.zooms_json)
            ELSE 0 END AS zoom_count,
       CASE WHEN json_valid(t.effects_json) THEN json_array_length(t.effects_json)
            ELSE 0 END AS effect_count,
       CASE WHEN json_valid(t.overlays_json) THEN json_array_length(t.overlays_json)
            ELSE 0 END AS overlay_count,
       t.created_at, t.updated_at
       FROM studio_takes t LEFT JOIN projects p ON p.id = t.project_id`;
  let rows: Array<{
    id: string;
    project_id: string | null;
    project_name: string | null;
    title: string;
    description: string | null;
    source_type: string;
    source_name: string | null;
    duration_ms: number;
    cut_count: number;
    zoom_count: number;
    effect_count: number;
    overlay_count: number;
    created_at: number;
    updated_at: number;
  }>;

  if (projectId) {
    rows = db
      .prepare(
        `${projection} WHERE t.project_id = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(projectId, pageSize, pageOffset) as typeof rows;
  } else {
    rows = db
      .prepare(`${projection} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`)
      .all(pageSize, pageOffset) as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    title: r.title,
    description: r.description,
    sourceType: (r.source_type as 'screen' | 'window') || 'screen',
    sourceName: r.source_name,
    durationMs: r.duration_ms,
    cutCount: r.cut_count,
    zoomCount: r.zoom_count,
    effectCount: r.effect_count,
    overlayCount: r.overlay_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getStudioTake(id: string): StudioTake | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT t.*, p.name AS project_name
         FROM studio_takes t
    LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.id = ?`,
    )
    .get(id) as StudioTakeRow | undefined;

  return row ? rowToTake(row) : null;
}

export function hasStudioTake(id: string): boolean {
  return Boolean(
    getDb().prepare('SELECT 1 FROM studio_takes WHERE id = ?').get(id),
  );
}

export function getStudioVideoPath(id: string): string | null {
  const row = getDb()
    .prepare('SELECT video_path FROM studio_takes WHERE id = ?')
    .get(id) as { video_path: string } | undefined;
  return row?.video_path || null;
}

/**
 * Resolve a media overlay's on-disk source by its id.
 *
 * Overlays live inside each take's `overlays_json`, so this scans the (small)
 * set of takes that have any. The `qeda-media://overlay/<id>` scheme uses this to
 * serve bytes without exposing arbitrary filesystem reads.
 */
export function getStudioOverlaySource(overlayId: string): string | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT overlays_json FROM studio_takes
        WHERE json_valid(overlays_json) = 1`,
    )
    .all() as Array<{ overlays_json: string | null }>;

  for (const row of rows) {
    const overlays = parseJsonSafe<StudioOverlay[]>(row.overlays_json, []);
    const match = overlays.find((overlay) => overlay.id === overlayId);
    if (match?.srcPath) return match.srcPath;
  }
  return null;
}

export function saveStudioTake(take: {
  id: string;
  projectId?: string | null;
  title?: string;
  description?: string | null;
  sourceType?: 'screen' | 'window';
  sourceName?: string | null;
  durationMs?: number;
  videoPath?: string;
  audioPath?: string | null;
  mouseEventsPath?: string | null;
  cuts?: StudioCut[];
  zooms?: StudioZoom[];
  captions?: StudioCaption[];
  effects?: StudioEffect[];
  overlays?: StudioOverlay[];
  styling?: StudioStyling;
  socialKit?: StudioSocialKit | null;
}): StudioTake {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const existingRow = db
    .prepare('SELECT created_at FROM studio_takes WHERE id = ?')
    .get(take.id) as { created_at: number } | undefined;

  if (existingRow) {
    const columns: Partial<Record<keyof typeof take, string>> = {
      projectId: 'project_id',
      title: 'title',
      description: 'description',
      sourceType: 'source_type',
      sourceName: 'source_name',
      durationMs: 'duration_ms',
      videoPath: 'video_path',
      audioPath: 'audio_path',
      mouseEventsPath: 'mouse_events_path',
      cuts: 'cuts_json',
      zooms: 'zooms_json',
      captions: 'captions_json',
      effects: 'effects_json',
      overlays: 'overlays_json',
      styling: 'styling_json',
      socialKit: 'social_kit_json',
    };
    const jsonFields = new Set([
      'cuts',
      'zooms',
      'captions',
      'effects',
      'overlays',
      'styling',
      'socialKit',
    ]);
    const updates = Object.entries(columns).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(take, key) &&
      take[key as keyof typeof take] !== undefined,
    );

    if (updates.length > 0) {
      const setClauses = updates.map(([, column]) => `${column} = ?`);
      const values = updates.map(([key]) => {
        const value = take[key as keyof typeof take];
        if (!jsonFields.has(key)) return value;
        return value == null && key === 'socialKit'
          ? null
          : JSON.stringify(value);
      });
      db.prepare(
        `UPDATE studio_takes SET ${setClauses.join(', ')}, updated_at = ? WHERE id = ?`,
      ).run(...values, now, take.id);
    }
    return getStudioTake(take.id)!;
  }

  const merged = {
    projectId: take.projectId ?? null,
    title: take.title || 'Untitled Showcase Take',
    description: take.description ?? null,
    sourceType: take.sourceType || 'screen',
    sourceName: take.sourceName ?? null,
    durationMs: take.durationMs ?? 0,
    videoPath: take.videoPath || '',
    audioPath: take.audioPath ?? null,
    mouseEventsPath: take.mouseEventsPath ?? null,
    cuts: take.cuts ?? [],
    zooms: take.zooms ?? [],
    captions: take.captions ?? [],
    effects: take.effects ?? [],
    overlays: take.overlays ?? [],
    styling: take.styling ?? DEFAULT_STUDIO_STYLING,
    socialKit: take.socialKit ?? null,
  };

  db.prepare(
    `INSERT INTO studio_takes (
       id, project_id, title, description, source_type, source_name,
       duration_ms, video_path, audio_path, mouse_events_path,
       cuts_json, zooms_json, captions_json, effects_json, overlays_json,
       styling_json, social_kit_json,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id        = excluded.project_id,
       title             = excluded.title,
       description       = excluded.description,
       source_type       = excluded.source_type,
       source_name       = excluded.source_name,
       duration_ms       = excluded.duration_ms,
       video_path        = excluded.video_path,
       audio_path        = excluded.audio_path,
       mouse_events_path = excluded.mouse_events_path,
       cuts_json         = excluded.cuts_json,
       zooms_json        = excluded.zooms_json,
       captions_json     = excluded.captions_json,
       effects_json      = excluded.effects_json,
       overlays_json     = excluded.overlays_json,
       styling_json      = excluded.styling_json,
       social_kit_json   = excluded.social_kit_json,
       updated_at        = excluded.updated_at`,
  ).run(
    take.id,
    merged.projectId,
    merged.title,
    merged.description,
    merged.sourceType,
    merged.sourceName,
    merged.durationMs,
    merged.videoPath,
    merged.audioPath,
    merged.mouseEventsPath,
    JSON.stringify(merged.cuts),
    JSON.stringify(merged.zooms),
    JSON.stringify(merged.captions),
    JSON.stringify(merged.effects),
    JSON.stringify(merged.overlays),
    JSON.stringify(merged.styling),
    merged.socialKit ? JSON.stringify(merged.socialKit) : null,
    now,
    now,
  );

  return getStudioTake(take.id)!;
}

export function deleteStudioTake(id: string): boolean {
  const db = getDb();
  const info = db.prepare('DELETE FROM studio_takes WHERE id = ?').run(id);
  return info.changes > 0;
}
