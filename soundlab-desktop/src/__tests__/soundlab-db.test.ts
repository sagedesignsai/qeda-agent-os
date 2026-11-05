/**
 * __tests__/soundlab-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the SoundLab SQLite schema and CRUD operations.
 *   - Both tables created by applyMigrations (idempotency)
 *   - Foreign key constraints (cascade delete, project SET NULL)
 *   - JSON round-trip serialization for config/patterns/clips/automation
 *   - listSoundLabSessions project filtering
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  listSoundLabSessions,
  getSoundLabSession,
  saveSoundLabSession,
  deleteSoundLabSession,
} from '../main/db/soundlab-store';
import type { SoundLabSessionWithTracks } from '../lib/soundlab-types';
import { buildDefaultTracks } from '../lib/soundlab-types';

function makeSession(
  overrides: Partial<SoundLabSessionWithTracks> = {},
): SoundLabSessionWithTracks {
  const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    projectId: null,
    title: 'Test Session',
    bpm: 120,
    keySignature: 'C',
    targetBand: 'alpha',
    durationBeats: 64,
    loopEnabled: false,
    loopStartBeat: 0,
    loopEndBeat: 32,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tracks: buildDefaultTracks(id, 'alpha'),
    ...overrides,
  };
}

describe('soundlab schema', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db as any);
  });

  afterEach(() => {
    useTestDatabase(null as any);
    db.close();
  });

  it('creates soundlab_sessions table', () => {
    const cols = db
      .prepare('PRAGMA table_info(soundlab_sessions)')
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('id');
    expect(names).toContain('project_id');
    expect(names).toContain('bpm');
    expect(names).toContain('target_band');
    expect(names).toContain('loop_enabled');
  });

  it('creates soundlab_tracks table', () => {
    const cols = db
      .prepare('PRAGMA table_info(soundlab_tracks)')
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('id');
    expect(names).toContain('session_id');
    expect(names).toContain('config_json');
    expect(names).toContain('patterns_json');
    expect(names).toContain('clips_json');
    expect(names).toContain('automation_json');
  });

  it('applyMigrations is idempotent (run twice)', () => {
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it('soundlab_tracks has FK to soundlab_sessions', () => {
    const fks = db
      .prepare('PRAGMA foreign_key_list(soundlab_tracks)')
      .all() as Array<{ table: string; from: string }>;
    const sessionFk = fks.find((f) => f.table === 'soundlab_sessions');
    expect(sessionFk).toBeDefined();
    expect(sessionFk?.from).toBe('session_id');
  });
});

describe('soundlab CRUD', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db as any);
  });

  afterEach(() => {
    useTestDatabase(null as any);
    db.close();
  });

  it('saves and retrieves a session with tracks', () => {
    const session = makeSession({ title: 'Round-Trip Test', bpm: 90 });
    saveSoundLabSession(session);

    const loaded = getSoundLabSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Round-Trip Test');
    expect(loaded!.bpm).toBe(90);
    expect(loaded!.tracks).toHaveLength(session.tracks.length);
  });

  it('JSON round-trips config, patterns, clips, automation', () => {
    const session = makeSession();
    // Inject known values into the first track
    session.tracks[0].config = {
      preset: 'ambient-pluck',
      attack: 0.05,
      reverb: { wet: 0.4, decay: 1.5 },
    };
    session.tracks[0].patterns = [
      {
        id: 'p-1',
        trackId: session.tracks[0].id,
        name: 'Chord Loop',
        lengthBeats: 8,
        notes: [
          {
            id: 'n-1',
            pitch: 60,
            startBeat: 0,
            durationBeats: 1,
            velocity: 0.8,
          },
        ],
      },
    ];
    saveSoundLabSession(session);

    const loaded = getSoundLabSession(session.id);
    expect(loaded!.tracks[0].config.preset).toBe('ambient-pluck');
    expect(loaded!.tracks[0].config.attack).toBe(0.05);
    expect(loaded!.tracks[0].config.reverb?.wet).toBe(0.4);
    expect(loaded!.tracks[0].patterns[0].notes[0].pitch).toBe(60);
  });

  it('updates a session on re-save (upsert)', () => {
    const session = makeSession({ title: 'Original' });
    saveSoundLabSession(session);
    saveSoundLabSession({ ...session, title: 'Updated', bpm: 140 });

    const loaded = getSoundLabSession(session.id);
    expect(loaded!.title).toBe('Updated');
    expect(loaded!.bpm).toBe(140);
  });

  it('lists sessions, optionally filtered by project', () => {
    // Insert project rows to satisfy the FK constraint on soundlab_sessions.project_id
    db.prepare(
      `INSERT OR IGNORE INTO projects (id, name, status) VALUES (?, ?, ?)`,
    ).run('proj-a', 'Project A', 'active');
    db.prepare(
      `INSERT OR IGNORE INTO projects (id, name, status) VALUES (?, ?, ?)`,
    ).run('proj-b', 'Project B', 'active');

    const s1 = makeSession({ projectId: 'proj-a' });
    const s2 = makeSession({ projectId: 'proj-b' });
    const s3 = makeSession({ projectId: null });
    saveSoundLabSession(s1);
    saveSoundLabSession(s2);
    saveSoundLabSession(s3);

    const all = listSoundLabSessions();
    expect(all.length).toBeGreaterThanOrEqual(3);

    const filtered = listSoundLabSessions({ projectId: 'proj-a' });
    expect(filtered.every((s) => s.projectId === 'proj-a')).toBe(true);
  });

  it('deletes a session and cascades to tracks', () => {
    const session = makeSession();
    saveSoundLabSession(session);
    expect(getSoundLabSession(session.id)).not.toBeNull();

    const ok = deleteSoundLabSession(session.id);
    expect(ok).toBe(true);
    expect(getSoundLabSession(session.id)).toBeNull();

    // Confirm tracks were cascade-deleted
    const rows = db
      .prepare('SELECT id FROM soundlab_tracks WHERE session_id = ?')
      .all(session.id);
    expect(rows).toHaveLength(0);
  });

  it('returns false when deleting a non-existent session', () => {
    const ok = deleteSoundLabSession('does-not-exist');
    expect(ok).toBe(false);
  });
});
