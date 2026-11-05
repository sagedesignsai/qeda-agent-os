/**
 * __tests__/music-copilot.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the Music Copilot's tools directly against an in-memory library.
 *
 * The important guarantees are behavioural: search returns real ids, playlist
 * writes are durable, playback commands reference playable tracks only, and a
 * scene/focus hand-off emits the exact command the renderer understands.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// The `ai` package is ESM-only; `tool()` just needs to return its config.
jest.mock('ai', () => ({
  tool: jest.fn((config: unknown) => config),
  isStepCount: jest.fn(),
}));

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  addMusicFolder,
  getMusicPlaylist,
  listPlaylistTracks,
  upsertScannedTrack,
} from '../main/db/music-store';
import { createTask } from '../main/db/tasks';
import { createMusicTools } from '../main/tools/music';
import type { MusicCopilotCommand, ScannedTrack } from '../lib/music/types';

function scanned(overrides: Partial<ScannedTrack> & { path: string }): ScannedTrack {
  return {
    title: overrides.path.split('/').pop() ?? 'track',
    artist: 'Aphex Twin',
    album: 'Selected Ambient Works 85-92',
    album_artist: 'Aphex Twin',
    genre: 'Ambient',
    year: 1992,
    track_no: 1,
    disc_no: 1,
    duration_ms: 300_000,
    bitrate: 320_000,
    codec: 'MPEG 1 Layer 3',
    size: 1024,
    mtime: 1_700_000_000,
    has_art: false,
    ...overrides,
  };
}

/** Invoke a tool the way the SDK does: `execute(input, options)`. */
function run(tool: unknown, input: unknown): Promise<any> {
  return (
    tool as { execute: (i: unknown, o: unknown) => Promise<any> }
  ).execute(input, { toolCallId: 'test', messages: [] });
}

describe('Music Copilot tools', () => {
  let db: Database.Database;
  let onCommand: jest.Mock;
  let onChanged: jest.Mock;
  let tools: ReturnType<typeof createMusicTools>;
  let xtal: string;
  let rhubarb: string;
  let windowlicker: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);

    onCommand = jest.fn();
    onChanged = jest.fn();
    tools = createMusicTools({ onCommand, onChanged });

    const folder = addMusicFolder('/music/copilot');
    xtal = upsertScannedTrack(
      folder.id,
      scanned({
        path: '/music/copilot/xtal.mp3',
        title: 'Xtal',
        genre: 'Ambient',
      }),
      100,
    ).id;
    rhubarb = upsertScannedTrack(
      folder.id,
      scanned({
        path: '/music/copilot/rhubarb.mp3',
        title: 'Rhubarb',
        duration_ms: 405_000,
      }),
      100,
    ).id;
    windowlicker = upsertScannedTrack(
      folder.id,
      scanned({
        path: '/music/copilot/windowlicker.mp3',
        title: 'Windowlicker',
        album: 'Windowlicker',
        genre: 'Electronic',
        duration_ms: 365_000,
      }),
      100,
    ).id;
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  it('summarizes the library and names usable scenes', async () => {
    const result = await run(tools.getMusicLibrarySummary, {});

    expect(result.success).toBe(true);
    expect(result.totalTracks).toBe(3);
    expect(result.topArtists[0]).toMatchObject({ name: 'Aphex Twin' });
    expect(result.scenes.map((scene: { id: string }) => scene.id)).toEqual(
      expect.arrayContaining(['deep-work', 'rain-room', 'late-night']),
    );
    expect(result.playlists).toEqual([]);
  });

  it('searches by text and returns concrete library ids', async () => {
    const result = await run(tools.searchMusic, { query: 'xtal' });

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result.tracks[0]).toMatchObject({
      id: xtal,
      title: 'Xtal',
      artist: 'Aphex Twin',
    });
  });

  it('creates a playlist and drops ids that are not in the library', async () => {
    const result = await run(tools.createPlaylist, {
      name: 'Deep Work',
      description: 'Long, wordless focus',
      trackIds: [xtal, 'does-not-exist', rhubarb],
    });

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(onChanged).toHaveBeenCalled();

    const saved = getMusicPlaylist(result.playlist.id);
    expect(saved?.name).toBe('Deep Work');
    expect(saved?.track_count).toBe(2);
  });

  it('queues a saved playlist through a typed playback command', async () => {
    const created = await run(tools.createPlaylist, {
      name: 'Rain Room',
      trackIds: [xtal, rhubarb],
    });

    const result = await run(tools.playMusic, {
      playlistId: created.playlist.id,
      shuffle: false,
    });

    expect(result.success).toBe(true);
    expect(result.queued).toBe(2);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'play',
      trackIds: [xtal, rhubarb],
      shuffle: false,
    } satisfies MusicCopilotCommand);
  });

  it('refuses to play a queue of unknown ids', async () => {
    const result = await run(tools.playMusic, {
      trackIds: ['nope', 'still-nope'],
    });

    expect(result.success).toBe(false);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('controls transport without touching the queue', async () => {
    const result = await run(tools.controlPlayback, { action: 'pause' });

    expect(result).toEqual({ success: true, action: 'pause' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'pause' });
  });

  it('applies a scene with the canonical config and starts it', async () => {
    const result = await run(tools.setAmbience, { scene: 'rain-room' });

    expect(result.success).toBe(true);
    expect(result.scene).toEqual({ id: 'rain-room', name: 'Rain room' });
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scene',
        sceneId: 'rain-room',
        start: true,
      }),
    );
    const command = onCommand.mock.calls[0][0] as MusicCopilotCommand;
    expect(command.type).toBe('scene');
    if (command.type === 'scene') {
      expect(Object.keys(command.config.soundscape.layers)).toContain('rain');
    }
  });

  it('sets music and ambience levels independently', async () => {
    const result = await run(tools.setLevels, {
      music: 0.4,
      ambience: 0.15,
    });

    expect(result.success).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'levels',
      music: 0.4,
      ambience: 0.15,
    });
  });

  it('hands a concrete task into a focus session', async () => {
    const task = createTask({ title: 'Write the release notes', priority: 1 });

    const listed = await run(tools.listFocusTasks, {});
    expect(listed.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: task.id, title: task.title }),
      ]),
    );

    const result = await run(tools.startFocusSession, {
      taskId: task.id,
      presetIndex: 1,
    });

    expect(result.success).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'focus',
      taskId: task.id,
      presetIndex: 1,
    });
  });

  it('adds tracks to a playlist by name', async () => {
    const created = await run(tools.createPlaylist, {
      name: 'Late Night',
      trackIds: [xtal],
    });

    const result = await run(tools.addToPlaylist, {
      playlist: 'late night',
      trackIds: [rhubarb, windowlicker],
    });

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(
      listPlaylistTracks(created.playlist.id).map((track) => track.id),
    ).toEqual([xtal, rhubarb, windowlicker]);
  });
});
