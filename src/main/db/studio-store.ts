/**
 * db/studio-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite storage and domain models for Studio: Showcase Generator.
 *
 * Persists recording takes, mouse telemetry references, cuts, zoom keyframes,
 * captions, styling presets, and social release kits. Tied optionally to projects
 * via project_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from './client.js';
import type {
  StudioCut,
  StudioZoom,
  StudioCaption,
  StudioCaptionWord,
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
): StudioTakeSummary[] {
  const db = getDb();
  let rows: StudioTakeRow[];

  if (projectId) {
    rows = db
      .prepare(
        `SELECT t.*, p.name AS project_name
           FROM studio_takes t
      LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.project_id = ?
       ORDER BY t.created_at DESC`,
      )
      .all(projectId) as StudioTakeRow[];
  } else {
    rows = db
      .prepare(
        `SELECT t.*, p.name AS project_name
           FROM studio_takes t
      LEFT JOIN projects p ON p.id = t.project_id
       ORDER BY t.created_at DESC`,
      )
      .all() as StudioTakeRow[];
  }

  return rows.map((r) => {
    const cuts = parseJsonSafe<StudioCut[]>(r.cuts_json, []);
    const zooms = parseJsonSafe<StudioZoom[]>(r.zooms_json, []);
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      title: r.title,
      description: r.description,
      sourceType: (r.source_type as 'screen' | 'window') || 'screen',
      sourceName: r.source_name,
      durationMs: r.duration_ms,
      videoPath: r.video_path,
      cutCount: cuts.length,
      zoomCount: zooms.length,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
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

export function saveStudioTake(take: {
  id: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  sourceType?: 'screen' | 'window';
  sourceName?: string | null;
  durationMs?: number;
  videoPath: string;
  audioPath?: string | null;
  mouseEventsPath?: string | null;
  cuts?: StudioCut[];
  zooms?: StudioZoom[];
  captions?: StudioCaption[];
  styling?: StudioStyling;
  socialKit?: StudioSocialKit | null;
}): StudioTake {
  const db = getDb();
  const existing = getStudioTake(take.id);
  const now = Math.floor(Date.now() / 1000);

  const merged = {
    projectId:
      take.projectId !== undefined
        ? take.projectId
        : (existing?.projectId ?? null),
    title: take.title || existing?.title || 'Untitled Showcase Take',
    description:
      take.description !== undefined
        ? take.description
        : (existing?.description ?? null),
    sourceType: take.sourceType || existing?.sourceType || 'screen',
    sourceName:
      take.sourceName !== undefined
        ? take.sourceName
        : (existing?.sourceName ?? null),
    durationMs:
      take.durationMs !== undefined
        ? take.durationMs
        : (existing?.durationMs ?? 0),
    videoPath: take.videoPath || existing?.videoPath || '',
    audioPath:
      take.audioPath !== undefined
        ? take.audioPath
        : (existing?.audioPath ?? null),
    mouseEventsPath:
      take.mouseEventsPath !== undefined
        ? take.mouseEventsPath
        : (existing?.mouseEventsPath ?? null),
    cuts: take.cuts || existing?.cuts || [],
    zooms: take.zooms || existing?.zooms || [],
    captions: take.captions || existing?.captions || [],
    styling: take.styling || existing?.styling || DEFAULT_STUDIO_STYLING,
    socialKit:
      take.socialKit !== undefined
        ? take.socialKit
        : (existing?.socialKit ?? null),
  };

  db.prepare(
    `INSERT INTO studio_takes (
       id, project_id, title, description, source_type, source_name,
       duration_ms, video_path, audio_path, mouse_events_path,
       cuts_json, zooms_json, captions_json, styling_json, social_kit_json,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(merged.styling),
    merged.socialKit ? JSON.stringify(merged.socialKit) : null,
    existing?.createdAt ?? now,
    now,
  );

  return getStudioTake(take.id)!;
}

export function deleteStudioTake(id: string): boolean {
  const db = getDb();
  const info = db.prepare('DELETE FROM studio_takes WHERE id = ?').run(id);
  return info.changes > 0;
}
