import Database from 'better-sqlite3';

import { MotionProjectIndex } from '@/main/motion/project-index';
import { applyMigrations } from '@/main/db/schema';

describe('MotionProjectIndex', () => {
  let db: Database.Database;
  let index: MotionProjectIndex;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    index = new MotionProjectIndex(() => db);
  });

  afterEach(() => db.close());

  it('upserts bundle metadata, marks missing folders, and deletes only the index row', () => {
    const row = {
      id: 'prj_test123456', name: 'Launch', path: '/motion/projects/prj_test123456',
      scene_count: 1, duration: 6, width: 1920, height: 1080, fps: 30,
      thumbnail_path: null, last_opened_at: null, updated_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z', missing: 0,
    };
    index.upsert(row);
    expect(index.get(row.id)).toMatchObject({ name: 'Launch', missing: 0 });
    index.markMissing(row.id, true);
    expect(index.list()).toEqual([expect.objectContaining({ id: row.id, missing: 1 })]);
    index.delete(row.id);
    expect(index.get(row.id)).toBeUndefined();
  });
});
