/**
 * hooks/use-music-library.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Query state for the music library: folders, facets, tracks, playlists and the
 * scan lifecycle.
 *
 * `pages/Music.tsx` used to own all of this, which made the page the only place
 * that knew how to refresh a library. Keeping it here means the page composes
 * UI, and any future surface (a palette command, a scene editor) can reuse the
 * same queries without re-implementing the debounce or the `music:changed`
 * subscription.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useIpcEvent } from './use-ipc';
import type {
  LibrarySort,
  MusicFacets,
  MusicFolder,
  MusicPlaylist,
  MusicScanProgress,
  MusicTrack,
  MusicTrackPage,
} from '@/lib/music/types';

export type MusicBrowse = 'tracks' | 'artists' | 'albums' | 'playlists';

export const SORT_LABELS: Record<LibrarySort, string> = {
  artist: 'Artist',
  album: 'Album',
  title: 'Title',
  added: 'Date added',
  duration: 'Duration',
};

export function useMusicLibrary() {
  const navigate = useNavigate();
  const { playlistId } = useParams<{ playlistId?: string }>();

  const [folders, setFolders] = useState<MusicFolder[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [facets, setFacets] = useState<MusicFacets>({ artists: [], albums: [] });
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [playlistTracks, setPlaylistTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<MusicScanProgress | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('artist');
  const [ascending, setAscending] = useState(true);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [artist, setArtist] = useState<string | null>(null);
  const [album, setAlbum] = useState<string | null>(null);
  const [browse, setBrowse] = useState<MusicBrowse>('tracks');

  const loadFolders = useCallback(async () => {
    try {
      setFolders(
        await window.electron.ipc.invoke<MusicFolder[]>('music:folders-list'),
      );
    } catch {
      /* the empty state covers this */
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      setPlaylists(
        await window.electron.ipc.invoke<MusicPlaylist[]>(
          'music:playlists-list',
        ),
      );
    } catch {
      /* the empty state covers this */
    }
  }, []);

  const loadFacets = useCallback(async () => {
    try {
      setFacets(
        await window.electron.ipc.invoke<MusicFacets>('music:facets', {
          folderId,
        }),
      );
    } catch {
      /* facets are an enhancement, not a requirement */
    }
  }, [folderId]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const page = await window.electron.ipc.invoke<MusicTrackPage>(
        'music:library-query',
        {
          query: query.trim() || undefined,
          folderId,
          artist,
          album,
          sort,
          direction: ascending ? 'asc' : 'desc',
          limit: 500,
        },
      );
      setTracks(page.rows);
      setTotal(page.total);
    } catch {
      toast.error('Could not load the library');
    } finally {
      setLoading(false);
    }
  }, [query, folderId, artist, album, sort, ascending]);

  const loadPlaylistTracks = useCallback(async (id: string) => {
    try {
      setPlaylistTracks(
        await window.electron.ipc.invoke<MusicTrack[]>('music:playlist-tracks', {
          id,
        }),
      );
    } catch {
      toast.error('Could not load the playlist');
    }
  }, []);

  // Debounced so typing in the filter does not fire a query per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(), 150);
    return () => window.clearTimeout(timer);
  }, [loadLibrary]);

  useEffect(() => {
    void loadFolders();
    void loadPlaylists();
    void loadFacets();
  }, [loadFolders, loadPlaylists, loadFacets]);

  useEffect(() => {
    if (playlistId) void loadPlaylistTracks(playlistId);
    else setPlaylistTracks([]);
  }, [playlistId, loadPlaylistTracks]);

  useIpcEvent(
    'music:changed',
    () => {
      void loadFolders();
      void loadPlaylists();
      void loadFacets();
      void loadLibrary();
      if (playlistId) void loadPlaylistTracks(playlistId);
    },
    [
      playlistId,
      loadFolders,
      loadPlaylists,
      loadFacets,
      loadLibrary,
      loadPlaylistTracks,
    ],
  );

  useIpcEvent('music:scan-progress', (payload: unknown) => {
    setScan(payload as MusicScanProgress);
  });

  const resetFilters = useCallback(() => {
    setArtist(null);
    setAlbum(null);
    setFolderId(null);
    setQuery('');
    setBrowse('tracks');
    if (playlistId) navigate('/music');
  }, [navigate, playlistId]);

  const addFolder = useCallback(async () => {
    try {
      const picked = await window.electron.ipc.invoke<{ path: string | null }>(
        'music:folder-pick',
      );
      if (!picked.path) return;
      const folder = await window.electron.ipc.invoke<MusicFolder>(
        'music:folder-add',
        { path: picked.path },
      );
      await loadFolders();
      await window.electron.ipc.invoke('music:scan-start', {
        folderId: folder.id,
      });
    } catch {
      toast.error('Could not add that folder');
    }
  }, [loadFolders]);

  const removeFolder = useCallback(
    async (id: string) => {
      try {
        await window.electron.ipc.invoke('music:folder-remove', { id });
        if (folderId === id) setFolderId(null);
        await loadFolders();
        toast.success('Folder removed. Its files are untouched.');
      } catch {
        toast.error('Could not remove the folder');
      }
    },
    [folderId, loadFolders],
  );

  const startScan = useCallback(async () => {
    if (folders.length === 0) {
      toast.info('Add a folder first');
      return;
    }
    try {
      const result = await window.electron.ipc.invoke<{ started: boolean }>(
        'music:scan-start',
      );
      if (!result.started) toast.info('Nothing to scan yet');
    } catch {
      toast.error('Could not start the scan');
    }
  }, [folders.length]);

  const cancelScan = useCallback(async () => {
    try {
      await window.electron.ipc.invoke('music:scan-cancel');
    } catch {
      /* cancelling is best-effort */
    }
  }, []);

  const createPlaylist = useCallback(
    async (name: string): Promise<MusicPlaylist | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      try {
        const playlist = await window.electron.ipc.invoke<MusicPlaylist>(
          'music:playlist-create',
          { name: trimmed },
        );
        setPlaylists((prev) => [...prev, playlist]);
        navigate(`/music/${playlist.id}`);
        return playlist;
      } catch {
        toast.error('Could not create the playlist');
        return null;
      }
    },
    [navigate],
  );

  const deletePlaylist = useCallback(
    async (id: string) => {
      try {
        await window.electron.ipc.invoke('music:playlist-delete', { id });
        setPlaylists((prev) => prev.filter((row) => row.id !== id));
        if (playlistId === id) navigate('/music');
      } catch {
        toast.error('Could not delete the playlist');
      }
    },
    [navigate, playlistId],
  );

  const removeFromPlaylist = useCallback(
    async (trackId: string) => {
      if (!playlistId) return;
      try {
        await window.electron.ipc.invoke('music:playlist-remove-track', {
          id: playlistId,
          trackId,
        });
        setPlaylistTracks((prev) => prev.filter((row) => row.id !== trackId));
      } catch {
        toast.error('Could not remove the track');
      }
    },
    [playlistId],
  );

  const activePlaylist = useMemo(
    () => playlists.find((row) => row.id === playlistId) ?? null,
    [playlists, playlistId],
  );

  const visibleTracks = playlistId ? playlistTracks : tracks;

  const heading = activePlaylist
    ? activePlaylist.name
    : browse === 'artists'
      ? 'Artists'
      : browse === 'albums'
        ? 'Albums'
        : browse === 'playlists'
          ? 'Playlists'
          : folderId
            ? (folders.find((row) => row.id === folderId)?.path
                .split(/[\\/]/)
                .filter(Boolean)
                .pop() ?? 'Folder')
            : artist
              ? artist
              : album
                ? album
                : 'All tracks';

  const filteredArtists = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? facets.artists.filter((row) => row.name.toLowerCase().includes(term))
      : facets.artists;
  }, [facets.artists, query]);

  const filteredAlbums = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? facets.albums.filter(
          (row) =>
            row.name.toLowerCase().includes(term) ||
            (row.artist ?? '').toLowerCase().includes(term),
        )
      : facets.albums;
  }, [facets.albums, query]);

  return {
    playlistId,
    folders,
    playlists,
    facets,
    tracks,
    total,
    playlistTracks,
    loading,
    scan,
    query,
    setQuery,
    sort,
    setSort,
    ascending,
    setAscending,
    folderId,
    setFolderId,
    artist,
    setArtist,
    album,
    setAlbum,
    browse,
    setBrowse,
    activePlaylist,
    visibleTracks,
    heading,
    filteredArtists,
    filteredAlbums,
    resetFilters,
    clearScan: () => setScan(null),
    addFolder,
    removeFolder,
    startScan,
    cancelScan,
    createPlaylist,
    deletePlaylist,
    removeFromPlaylist,
  };
}

export type MusicLibrary = ReturnType<typeof useMusicLibrary>;
