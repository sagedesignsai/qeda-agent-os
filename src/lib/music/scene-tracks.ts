/**
 * lib/music/scene-tracks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolving a scene's optional music source into a playable queue.
 *
 * Scenes live in two places (code for built-ins, SQLite for user saves), and the
 * two callers that start scene music — the focus ritual and the scene picker —
 * must resolve `library` / `folder` / `playlist` identically. Keeping the lookup
 * here is what stops a saved playlist scene from behaving differently from the
 * built-in library shuffle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AudioSceneConfig, MusicTrack, MusicTrackPage } from './types';
import { shuffleIds } from './queue';

export type SceneMusicSource = NonNullable<AudioSceneConfig['music']>;

export async function fetchSceneTracks(
  source: SceneMusicSource,
): Promise<MusicTrack[]> {
  if (source.source === 'playlist' && source.id) {
    const rows = await window.electron.ipc.invoke<MusicTrack[]>(
      'music:playlist-tracks',
      { id: source.id },
    );
    return applyShuffle(rows ?? [], source.shuffle);
  }

  const page = await window.electron.ipc.invoke<MusicTrackPage>(
    'music:library-query',
    {
      folderId: source.source === 'folder' ? source.id : null,
      sort: 'artist',
      limit: 500,
    },
  );
  return applyShuffle(page.rows ?? [], source.shuffle);
}

function applyShuffle(tracks: MusicTrack[], shuffle: boolean | undefined): MusicTrack[] {
  if (!shuffle || tracks.length < 2) return tracks;
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return shuffleIds(tracks.map((track) => track.id))
    .map((id) => byId.get(id))
    .filter((track): track is MusicTrack => Boolean(track));
}
