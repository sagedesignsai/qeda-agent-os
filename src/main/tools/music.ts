/**
 * tools/music.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Music Copilot's hands: library search, playlist curation, transport,
 * ambience and focus hand-off.
 *
 * Reads and playlist writes happen in main because the library lives there.
 * Playback, scenes and focus are renderer state, so those tools emit a typed
 * `MusicCopilotCommand` instead of pretending they can touch the audio engine.
 *
 * Track ids are the only currency. Every play or playlist call resolves ids
 * against `music_tracks` first and reports what it skipped, so a hallucinated id
 * never reaches the player.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { shuffleIds } from '../../lib/music/queue.js';
import { BUILTIN_SCENES } from '../../lib/music/scenes.js';
import {
  addTracksToPlaylist,
  createMusicPlaylist,
  getMusicPlaylist,
  getMusicTracksByIds,
  listMusicPlaylists,
  listMusicScenes,
  listPlaylistTracks,
  musicFacets,
  queryMusicTracks,
} from '../db/music-store.js';
import { getTask, listTasks } from '../db/tasks.js';
import type {
  MusicCopilotCommand,
  MusicPlaylist,
  MusicScene,
  MusicTrack,
} from '../../lib/music/types.js';

export interface CreateMusicToolsOptions {
  /** Send a playback/scene/focus command to the renderer. */
  onCommand?: (command: MusicCopilotCommand) => void;
  /** A playlist changed; the library surface should refresh. */
  onChanged?: () => void;
}

const noop = () => {};

function compactTrack(track: MusicTrack) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationSec: Math.round(track.duration_ms / 1000),
  };
}

/** Resolve ids to playable rows; unknown or missing tracks are dropped. */
function playableTracks(ids: readonly string[]): MusicTrack[] {
  return getMusicTracksByIds([...ids]).filter((track) => !track.missing_at);
}

function resolvePlaylist(ref: string): MusicPlaylist | null {
  const byId = getMusicPlaylist(ref);
  if (byId) return byId;
  const name = ref.trim().toLowerCase();
  return (
    listMusicPlaylists().find(
      (playlist) => playlist.name.toLowerCase() === name,
    ) ?? null
  );
}

function allScenes(): MusicScene[] {
  return [...BUILTIN_SCENES, ...listMusicScenes()];
}

export function createMusicTools({
  onCommand = noop,
  onChanged = noop,
}: CreateMusicToolsOptions = {}) {
  return {
    getMusicLibrarySummary: tool({
      description:
        'Get a compact overview of the local library: track total, top artists and albums, saved playlists, and available ambience scenes. Call this before building a set.',
      inputSchema: z.object({}),
      execute: async () => {
        const facets = musicFacets();
        const playlists = listMusicPlaylists();
        const scenes = allScenes();
        return {
          success: true,
          totalTracks: queryMusicTracks({ limit: 1 }).total,
          topArtists: facets.artists.slice(0, 12),
          topAlbums: facets.albums.slice(0, 12),
          playlists: playlists.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            trackCount: playlist.track_count,
          })),
          scenes: scenes.map((scene) => ({
            id: scene.id,
            name: scene.name,
            builtin: Boolean(scene.builtin),
            musicSource: scene.config.music?.source ?? null,
            layers: Object.keys(scene.config.soundscape.layers),
          })),
          note:
            queryMusicTracks({ limit: 1 }).total === 0
              ? 'No tracks are indexed yet. Ask the user to add a music folder first.'
              : 'Use searchMusic to resolve concrete track ids before queueing or saving a playlist.',
        };
      },
    }),

    searchMusic: tool({
      description:
        'Search the local library by text, artist or album. Returns concrete track ids, titles, artists, albums and durations. Search several angles before choosing a set.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Free text matched against title, artist, album and album artist'),
        artist: z.string().optional().describe('Exact artist name filter'),
        album: z.string().optional().describe('Exact album name filter'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum rows to return (default 20)'),
      }),
      execute: async ({ query, artist, album, limit }) => {
        const page = queryMusicTracks({
          query,
          artist,
          album,
          limit: Math.min(50, Math.max(1, limit ?? 20)),
        });
        return {
          success: true,
          total: page.total,
          tracks: page.rows.map(compactTrack),
          note:
            page.total === 0
              ? 'No tracks matched. Try a broader query or a different artist/album.'
              : `${page.rows.length} of ${page.total} matching tracks shown.`,
        };
      },
    }),

    createPlaylist: tool({
      description:
        'Create a saved playlist from concrete track ids. This is the right tool when the user wants a set they can return to; use playMusic for one-off listening.',
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe('Playlist name'),
        description: z.string().max(400).optional().describe('Short description'),
        trackIds: z
          .array(z.string())
          .max(200)
          .optional()
          .describe('Track ids to add, usually from searchMusic'),
      }),
      execute: async ({ name, description, trackIds }) => {
        const tracks = playableTracks(trackIds ?? []);
        const playlist = createMusicPlaylist(name, description ?? '');
        const added = addTracksToPlaylist(
          playlist.id,
          tracks.map((track) => track.id),
        );
        onChanged();
        const saved = getMusicPlaylist(playlist.id) ?? playlist;
        return {
          success: true,
          playlist: {
            id: saved.id,
            name: saved.name,
            description: saved.description,
            trackCount: saved.track_count,
          },
          added,
          skipped: (trackIds?.length ?? 0) - added,
          note: `Created “${saved.name}” with ${added} track${added === 1 ? '' : 's'}.`,
        };
      },
    }),

    addToPlaylist: tool({
      description:
        'Add concrete track ids to an existing playlist, addressed by id or exact name.',
      inputSchema: z.object({
        playlist: z.string().describe('Playlist id or exact name'),
        trackIds: z
          .array(z.string())
          .min(1)
          .max(200)
          .describe('Track ids, usually from searchMusic'),
      }),
      execute: async ({ playlist: ref, trackIds }) => {
        const playlist = resolvePlaylist(ref);
        if (!playlist) {
          return {
            success: false,
            error: `No playlist named “${ref}” exists.`,
            playlists: listMusicPlaylists().map((entry) => ({
              id: entry.id,
              name: entry.name,
            })),
          };
        }
        const tracks = playableTracks(trackIds);
        const added = addTracksToPlaylist(
          playlist.id,
          tracks.map((track) => track.id),
        );
        if (added > 0) onChanged();
        return {
          success: true,
          playlist: { id: playlist.id, name: playlist.name },
          added,
          skipped: trackIds.length - added,
          note: `Added ${added} track${added === 1 ? '' : 's'} to “${playlist.name}”.`,
        };
      },
    }),

    playMusic: tool({
      description:
        'Start playback from a playlist or concrete track ids. Prefer this after searching. Set shuffle for a varied set; the renderer owns the actual audio.',
      inputSchema: z.object({
        playlistId: z.string().optional().describe('Play a saved playlist by id'),
        trackIds: z
          .array(z.string())
          .max(200)
          .optional()
          .describe('Track ids to play, usually from searchMusic'),
        shuffle: z
          .boolean()
          .optional()
          .describe('Shuffle the starting order and keep shuffle on'),
      }),
      execute: async ({ playlistId, trackIds, shuffle }) => {
        const source = playlistId
          ? listPlaylistTracks(playlistId).filter((track) => !track.missing_at)
          : playableTracks(trackIds ?? []);
        if (source.length === 0) {
          return {
            success: false,
            error: playlistId
              ? 'That playlist is empty or does not exist.'
              : 'None of those track ids resolve to playable library tracks.',
          };
        }
        const ids = shuffle
          ? shuffleIds(source.map((track) => track.id))
          : source.map((track) => track.id);
        onCommand({ type: 'play', trackIds: ids, shuffle: Boolean(shuffle) });
        return {
          success: true,
          queued: ids.length,
          first: source.slice(0, 5).map(compactTrack),
          note: `Queued ${ids.length} track${ids.length === 1 ? '' : 's'}${playlistId ? ' from the playlist' : ''}.`,
        };
      },
    }),

    controlPlayback: tool({
      description:
        'Control the transport without changing the queue: pause, resume, next, previous, or stop (stop also clears the queue).',
      inputSchema: z.object({
        action: z.enum(['pause', 'resume', 'next', 'previous', 'stop']),
      }),
      execute: async ({ action }) => {
        const commands: Record<
          'pause' | 'resume' | 'next' | 'previous' | 'stop',
          MusicCopilotCommand
        > = {
          pause: { type: 'pause' },
          resume: { type: 'resume' },
          next: { type: 'next' },
          previous: { type: 'previous' },
          stop: { type: 'stop' },
        };
        onCommand(commands[action]);
        return { success: true, action };
      },
    }),

    setAmbience: tool({
      description:
        'Apply an ambience scene by id or exact name (for example rain-room, forest-focus, late-night). Optionally start it. Use the scenes listed by getMusicLibrarySummary.',
      inputSchema: z.object({
        scene: z.string().describe('Scene id or exact name'),
        start: z
          .boolean()
          .optional()
          .describe('Start the ambience immediately (default true)'),
      }),
      execute: async ({ scene, start }) => {
        const target = scene.trim().toLowerCase();
        const scenes = allScenes();
        const match =
          scenes.find((entry) => entry.id.toLowerCase() === target) ??
          scenes.find((entry) => entry.name.toLowerCase() === target);
        if (!match) {
          return {
            success: false,
            error: `No scene matches “${scene}”.`,
            scenes: scenes.map((entry) => ({
              id: entry.id,
              name: entry.name,
            })),
          };
        }
        const shouldStart = start ?? true;
        onCommand({
          type: 'scene',
          sceneId: match.id,
          name: match.name,
          config: match.config,
          start: shouldStart,
        });
        return {
          success: true,
          scene: { id: match.id, name: match.name },
          started: shouldStart,
          note: `${shouldStart ? 'Applied and started' : 'Applied'} “${match.name}”.`,
        };
      },
    }),

    setLevels: tool({
      description:
        'Set music and/or ambience master volume from 0 to 1. Use for “quieter”, “turn the rain down”, or “bring the music up”.',
      inputSchema: z.object({
        music: z.number().min(0).max(1).optional().describe('Music master 0–1'),
        ambience: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Ambience master 0–1'),
      }),
      execute: async ({ music, ambience }) => {
        if (music === undefined && ambience === undefined) {
          return {
            success: false,
            error: 'Pass music, ambience, or both.',
          };
        }
        onCommand({ type: 'levels', music, ambience });
        return {
          success: true,
          music,
          ambience,
          note: [
            music !== undefined ? `music ${Math.round(music * 100)}%` : '',
            ambience !== undefined
              ? `ambience ${Math.round(ambience * 100)}%`
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
        };
      },
    }),

    listFocusTasks: tool({
      description:
        'List the user’s open tasks with ids, titles, priorities and estimates. Use this before starting a focus session so the task hand-off is concrete.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ limit }) => {
        const tasks = listTasks()
          .filter((task) => task.status !== 'done')
          .slice(0, Math.min(30, Math.max(1, limit ?? 12)))
          .map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            estimateMins: task.estimate_mins,
          }));
        return {
          success: true,
          tasks,
          note:
            tasks.length === 0
              ? 'No open tasks. Ask the user which task they want to focus on.'
              : 'Pick a task id and call startFocusSession.',
        };
      },
    }),

    startFocusSession: tool({
      description:
        'Start a focus session on a task and move the app to the focus view. Pair it with playMusic for a soundtrack.',
      inputSchema: z.object({
        taskId: z.string().describe('Task id from listFocusTasks'),
        presetIndex: z
          .number()
          .int()
          .min(0)
          .max(5)
          .optional()
          .describe('Focus preset index (0 = 25/5, 1 = 50/10)'),
      }),
      execute: async ({ taskId, presetIndex }) => {
        const task = getTask(taskId);
        if (!task) {
          return {
            success: false,
            error: `Task ${taskId} was not found.`,
          };
        }
        onCommand({ type: 'focus', taskId: task.id, presetIndex });
        return {
          success: true,
          task: { id: task.id, title: task.title },
          presetIndex,
          note: `Focus session queued for “${task.title}”.`,
        };
      },
    }),
  };
}
