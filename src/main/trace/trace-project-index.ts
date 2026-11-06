/**
 * main/trace/trace-project-index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite index for Trace project bundles.
 *
 * The JSON bundle on disk stays authoritative; this table is a rebuildable
 * catalog. It is deliberately a separate table from `motion_projects` — the two
 * editors share no documents.
 */

import { getDb } from '../db/client.js'

export type TraceProjectIndexRow = {
  id: string
  name: string
  path: string
  width: number
  height: number
  duration_ms: number
  fps: number
  element_count: number
  scene_count: number
  revision: number
  thumbnail_svg: string | null
  last_opened_at: string | null
  updated_at: string
  created_at: string
  missing: number
}

export class TraceProjectIndex {
  constructor(private readonly getDatabase = getDb) {}

  list(): TraceProjectIndexRow[] {
    return this.getDatabase()
      .prepare(
        'SELECT * FROM trace_projects ORDER BY updated_at DESC, name COLLATE NOCASE',
      )
      .all() as TraceProjectIndexRow[]
  }

  get(id: string): TraceProjectIndexRow | undefined {
    return this.getDatabase()
      .prepare('SELECT * FROM trace_projects WHERE id = ?')
      .get(id) as TraceProjectIndexRow | undefined
  }

  upsert(row: TraceProjectIndexRow): void {
    this.getDatabase()
      .prepare(
        `INSERT INTO trace_projects
           (id, name, path, width, height, duration_ms, fps, element_count,
            scene_count, revision, thumbnail_svg, last_opened_at, updated_at,
            created_at, missing)
         VALUES
           (@id, @name, @path, @width, @height, @duration_ms, @fps, @element_count,
            @scene_count, @revision, @thumbnail_svg, @last_opened_at, @updated_at,
            @created_at, @missing)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, path=excluded.path, width=excluded.width,
           height=excluded.height, duration_ms=excluded.duration_ms, fps=excluded.fps,
           element_count=excluded.element_count, scene_count=excluded.scene_count,
           revision=excluded.revision, thumbnail_svg=excluded.thumbnail_svg,
           last_opened_at=excluded.last_opened_at, updated_at=excluded.updated_at,
           created_at=excluded.created_at, missing=excluded.missing`,
      )
      .run(row)
  }

  touch(id: string, openedAt: string): void {
    this.getDatabase()
      .prepare('UPDATE trace_projects SET last_opened_at = ? WHERE id = ?')
      .run(openedAt, id)
  }

  markMissing(id: string, missing: boolean): void {
    this.getDatabase()
      .prepare('UPDATE trace_projects SET missing = ? WHERE id = ?')
      .run(missing ? 1 : 0, id)
  }

  delete(id: string): void {
    this.getDatabase().prepare('DELETE FROM trace_projects WHERE id = ?').run(id)
  }
}
