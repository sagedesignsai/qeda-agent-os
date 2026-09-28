/**
 * __tests__/studio-takes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Showcase Studio DB operations:
 *   - Schema migration idempotency for studio_takes
 *   - CRUD operations for showcase takes
 *   - Project-scoped filtering
 *   - Keyframe zooms, silence cuts, and styling persistence
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  listStudioTakes,
  getStudioTake,
  saveStudioTake,
  deleteStudioTake,
  DEFAULT_STUDIO_STYLING,
  type StudioTake,
} from '../main/db/studio-store';

describe('Showcase Studio Database Store', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    // @ts-expect-error test harness pattern per AGENTS.md
    useTestDatabase(db);
  });

  afterEach(() => {
    // @ts-expect-error reset test db
    useTestDatabase(null);
    db.close();
  });

  it('saves and retrieves a showcase take with default styling', () => {
    const saved = saveStudioTake({
      id: 'take-1',
      title: 'Initial Feature Demo',
      sourceType: 'window',
      sourceName: 'VS Code',
      durationMs: 8400,
      videoPath: '/tmp/test.webm',
    });

    expect(saved.id).toBe('take-1');
    expect(saved.title).toBe('Initial Feature Demo');
    expect(saved.sourceType).toBe('window');
    expect(saved.durationMs).toBe(8400);
    expect(saved.styling.aspectRatio).toBe('16:9');
    expect(saved.styling.zoomIntensity).toBe(1.5);

    const fetched = getStudioTake('take-1');
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Initial Feature Demo');
    expect(fetched?.durationMs).toBe(8400);
  });

  it('persists kinetic zoom keyframes, silence cuts, and captions', () => {
    saveStudioTake({
      id: 'take-2',
      title: 'Zoom Demo',
      videoPath: '/tmp/zoom.webm',
      durationMs: 12000,
      zooms: [
        {
          id: 'z-1',
          startMs: 1000,
          endMs: 3500,
          targetX: 0.65,
          targetY: 0.4,
          scale: 1.8,
        },
      ],
      cuts: [
        {
          id: 'c-1',
          startMs: 4000,
          endMs: 5200,
          reason: 'silence',
        },
      ],
      captions: [
        {
          id: 'cap-1',
          startMs: 500,
          endMs: 2500,
          text: 'Building intelligent local agents',
        },
      ],
    });

    const loaded = getStudioTake('take-2');
    expect(loaded?.zooms.length).toBe(1);
    expect(loaded?.zooms[0].scale).toBe(1.8);
    expect(loaded?.zooms[0].targetX).toBe(0.65);

    expect(loaded?.cuts.length).toBe(1);
    expect(loaded?.cuts[0].reason).toBe('silence');

    expect(loaded?.captions.length).toBe(1);
    expect(loaded?.captions[0].text).toBe('Building intelligent local agents');
  });

  it('filters takes by project scope', () => {
    // Seed project
    db.prepare(
      `INSERT INTO projects (id, name, description, status)
       VALUES ('proj-alpha', 'Project Alpha', 'Core App', 'active')`,
    ).run();

    saveStudioTake({
      id: 'take-scoped',
      projectId: 'proj-alpha',
      title: 'Alpha Showcase',
      videoPath: '/tmp/alpha.webm',
    });

    saveStudioTake({
      id: 'take-inbox',
      projectId: null,
      title: 'Inbox Showcase',
      videoPath: '/tmp/inbox.webm',
    });

    const all = listStudioTakes();
    expect(all.length).toBe(2);

    const scoped = listStudioTakes('proj-alpha');
    expect(scoped.length).toBe(1);
    expect(scoped[0].id).toBe('take-scoped');
    expect(scoped[0].projectName).toBe('Project Alpha');
  });

  it('deletes a showcase take cleanly', () => {
    saveStudioTake({
      id: 'take-del',
      title: 'To Delete',
      videoPath: '/tmp/del.webm',
    });

    expect(getStudioTake('take-del')).not.toBeNull();
    const deleted = deleteStudioTake('take-del');
    expect(deleted).toBe(true);
    expect(getStudioTake('take-del')).toBeNull();
  });
});
