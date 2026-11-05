/**
 * lib/music/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure domain types for the music library and player. No React, no IPC, no DOM
 * — both the main-process scanner and the renderer import from here, so the
 * shape of a track cannot drift between the index and the player.
 *
 * `path` never reaches the renderer as a playable URL. Playback goes through
 * `qeda-media://music/<id>`, which resolves the path in the main process; this
 * type is the row the renderer is allowed to see.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MusicFolder {
  id: string;
  path: string;
  added_at: number;
  last_scan_at: number | null;
  track_count: number;
}

export interface MusicTrack {
  id: string;
  folder_id: string | null;
  path: string;
  title: string;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  genre: string | null;
  year: number | null;
  track_no: number | null;
  disc_no: number | null;
  duration_ms: number;
  bitrate: number | null;
  codec: string | null;
  size: number;
  mtime: number;
  added_at: number;
  last_seen_at: number;
  missing_at: number | null;
  has_art: number;
  /** 1 while the row is indexed from its filename and tags are still being read. */
  meta_pending?: number;
}

/** Fields the scanner can discover; the store owns id/folder/timestamps. */
export type ScannedTrack = Pick<
  MusicTrack,
  | 'path'
  | 'title'
  | 'artist'
  | 'album'
  | 'album_artist'
  | 'genre'
  | 'year'
  | 'track_no'
  | 'disc_no'
  | 'duration_ms'
  | 'bitrate'
  | 'codec'
  | 'size'
  | 'mtime'
> & { has_art: boolean };

export interface MusicPlaylist {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  track_count: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type LibrarySort =
  | 'title'
  | 'artist'
  | 'album'
  | 'added'
  | 'duration';

export interface MusicLibraryQuery {
  query?: string;
  folderId?: string | null;
  artist?: string | null;
  album?: string | null;
  sort?: LibrarySort;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeMissing?: boolean;
}

export interface MusicTrackPage {
  rows: MusicTrack[];
  total: number;
}

export interface MusicFacets {
  artists: { name: string; count: number }[];
  albums: { name: string; artist: string | null; count: number }[];
}

export interface MusicQueue {
  trackIds: string[];
  /** Index into `trackIds`; -1 when the queue is empty. */
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface MusicPlaybackSnapshot {
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

export interface MusicStateRecord {
  queue: string[];
  currentTrackId: string | null;
  positionMs: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  crossfadeSec: number;
  duckDb: number;
  sceneId: string;
  soundscape: SoundscapeState | null;
}

export type MusicScanPhase = 'scanning' | 'done' | 'cancelled' | 'error';

/**
 * `discovering` — walking the folder, `total` is the running file count.
 * `indexing` — `total` is final; unchanged files are skipped, new ones appear
 * in the library at once and their tags are filled in as they are read.
 */
export type MusicScanStage = 'discovering' | 'indexing';

export interface MusicScanProgress {
  folderId: string;
  phase: MusicScanPhase;
  stage?: MusicScanStage;
  scanned: number;
  total: number;
  added: number;
  updated: number;
  missing: number;
  /** Files skipped because size and mtime matched the index. */
  unchanged?: number;
  /** Files whose tags could not be read; they stay indexed by filename. */
  failed?: number;
  /** Symlinks that were not followed. */
  skippedLinks?: number;
  error?: string;
}

// ─── Scenes & soundscape mix ──────────────────────────────────────────────────

export type SoundscapeLayerId =
  | 'forest'
  | 'rain'
  | 'waves'
  | 'drizzle'
  | 'heavy_rain'
  | 'roof_rain'
  | 'stream'
  | 'small_stream'
  | 'terrace_downpour'
  | 'thunder'
  | 'distant_thunder'
  | 'forest_after_rain'
  | 'wind';

export type NoiseType = 'white' | 'pink' | 'brown';
export type ToneMode = 'off' | 'binaural' | 'isochronic';

export interface SoundscapeLayerState {
  /** 0–1. Layers are off by omission, not by a zero volume. */
  volume: number;
}

export interface SoundscapeState {
  layers: Partial<Record<SoundscapeLayerId, SoundscapeLayerState>>;
  noise: NoiseType | null;
  noiseVolume: number;
  toneMode: ToneMode;
  carrierHz: number;
  beatHz: number;
  toneVolume: number;
  pulseDepth: number;
  masterVolume: number;
}

/** Where a scene takes its music from. `library` means "shuffle everything". */
export type SceneMusicSource = 'library' | 'folder' | 'playlist';

export interface AudioSceneConfig {
  soundscape: SoundscapeState;
  music: {
    source: SceneMusicSource;
    id?: string;
    shuffle?: boolean;
  } | null;
  /** Seconds; 0 disables crossfading. */
  crossfadeSec: number;
  /** Negative dB applied to the soundscape bus while music plays. */
  duckDb: number;
}

export interface MusicScene {
  id: string;
  name: string;
  config: AudioSceneConfig;
  created_at: number;
  updated_at: number;
  /** True for scenes shipped in code; they are read-only. */
  builtin?: boolean;
}

// ─── Music Copilot ───────────────────────────────────────────────────────────

/** What the renderer tells the agent about the current sound surface. */
export interface MusicCopilotContext {
  playing?: boolean;
  queueLength?: number;
  currentTrackTitle?: string | null;
  currentTrackArtist?: string | null;
  sceneId?: string;
}

/**
 * Playback/ambience commands emitted by the copilot's tools.
 *
 * The agent runs in main, but audio lives in the renderer. Commands are the
 * typed seam between them — the main process never pretends it can play a
 * track, and the renderer never has to trust arbitrary agent output.
 */
export type MusicCopilotCommand =
  | { type: 'play'; trackIds: string[]; shuffle?: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'stop' }
  | {
      type: 'scene';
      sceneId: string;
      name: string;
      config: AudioSceneConfig;
      start: boolean;
    }
  | { type: 'levels'; music?: number; ambience?: number }
  | { type: 'focus'; taskId: string; presetIndex?: number };
