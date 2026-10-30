/**
 * main/motion/project-index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite index for Motion bundles. Project JSON and assets remain authoritative;
 * this table is disposable and can be rebuilt from project folders.
 */

import { getDb } from '../db/client.js';

export type MotionProjectIndexRow = {
  id: string;
  name: string;
  path: string;
  scene_count: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  thumbnail_path: string | null;
  last_opened_at: string | null;
  updated_at: string;
  created_at: string;
  missing: number;
};

export class MotionProjectIndex {
  constructor(private readonly getDatabase = getDb) {}

  list(): MotionProjectIndexRow[] {
    return this.getDatabase().prepare(
      'SELECT * FROM motion_projects ORDER BY updated_at DESC, name COLLATE NOCASE',
    ).all() as MotionProjectIndexRow[];
  }

  get(id: string): MotionProjectIndexRow | undefined {
    return this.getDatabase().prepare('SELECT * FROM motion_projects WHERE id = ?').get(id) as MotionProjectIndexRow | undefined;
  }

  upsert(row: MotionProjectIndexRow): void {
    this.getDatabase().prepare(`
      INSERT INTO motion_projects
        (id, name, path, scene_count, duration, width, height, fps, thumbnail_path,
         last_opened_at, updated_at, created_at, missing)
      VALUES
        (@id, @name, @path, @scene_count, @duration, @width, @height, @fps, @thumbnail_path,
         @last_opened_at, @updated_at, @created_at, @missing)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, path=excluded.path, scene_count=excluded.scene_count,
        duration=excluded.duration, width=excluded.width, height=excluded.height,
        fps=excluded.fps, thumbnail_path=excluded.thumbnail_path,
        last_opened_at=excluded.last_opened_at, updated_at=excluded.updated_at,
        created_at=excluded.created_at, missing=excluded.missing
    `).run(row);
  }

  markMissing(id: string, missing: boolean): void {
    this.getDatabase().prepare('UPDATE motion_projects SET missing = ? WHERE id = ?').run(missing ? 1 : 0, id);
  }

  delete(id: string): void {
    this.getDatabase().prepare('DELETE FROM motion_projects WHERE id = ?').run(id);
  }
}
