/**
 * pages/Music.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The music library page — thin orchestration layer that composes subcomponents.
 *
 * Querying and library actions live in `useMusicLibrary`, playback lives in the
 * app-wide store, and the right rail is `NowPlaying` (shared with the dock).
 *
 * Layout is three columns on wide screens and collapses to a single column with
 * a sticky transport below `xl`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { HeadphonesIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMusicPlayerSlim } from '@/hooks/use-music-player-slim';
import { useMusicKeyboardShortcuts } from '@/hooks/use-music-keyboard-shortcuts';
import { useMusicLibrary } from '@/hooks/use-music-library';
import { AddToPlaylistDialog } from '@/components/music/AddToPlaylistDialog';
import { AlbumGrid } from '@/components/music/AlbumGrid';
import { ArtistGrid } from '@/components/music/ArtistGrid';
import { CreatePlaylistDialog } from '@/components/music/CreatePlaylistDialog';
import { MusicCopilotSheet } from '@/components/music/MusicCopilotSheet';
import { MusicFilterBar } from '@/components/music/MusicFilterBar';
import { MusicFooter } from '@/components/music/MusicFooter';
import { MusicHeader } from '@/components/music/MusicHeader';
import { MusicHome } from '@/components/music/MusicHome';
import { MusicSidebar } from '@/components/music/MusicSidebar';
import { NowPlaying, type NowPlayingTab } from '@/components/music/NowPlaying';
import { PlaylistGrid } from '@/components/music/PlaylistGrid';
import { PreviewFileDialog } from '@/components/music/PreviewFileDialog';
import { TrackList } from '@/components/music/TrackList';
import type { MusicTrack } from '@/lib/music/types';

export default function Music() {
  const navigate = useNavigate();
  const player = useMusicPlayerSlim();
  const {
    playlistId,
    folders,
    playlists,
    facets,
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
    clearScan,
    addFolder,
    removeFolder,
    startScan,
    cancelScan,
    createPlaylist: createPlaylistInLibrary,
    deletePlaylist: deletePlaylistInLibrary,
    removeFromPlaylist,
  } = useMusicLibrary();

  const [addToPlaylist, setAddToPlaylist] = useState<MusicTrack | null>(null);
  const [preview, setPreview] = useState<MusicTrack | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<NowPlayingTab>('queue');
  const [searchParams, setSearchParams] = useSearchParams();
  const copilotOpen = searchParams.get('copilot') === '1';
  const view =
    playlistId || searchParams.get('view') === 'library' ? 'library' : 'listen';
  const setMusicView = useCallback(
    (nextView: 'listen' | 'library') => {
      if (playlistId && nextView === 'listen') {
        navigate('/music');
        return;
      }
      if (playlistId && nextView === 'library') {
        navigate('/music?view=library');
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (nextView === 'listen') next.delete('view');
      else next.set('view', 'library');
      setSearchParams(next);
    },
    [playlistId, navigate, searchParams, setSearchParams],
  );
  const setCopilotOpen = useCallback(
    (open: boolean) => {
      const next = new URLSearchParams(searchParams);
      if (open) next.set('copilot', '1');
      else next.delete('copilot');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts — delegated to the dedicated hook.
  useMusicKeyboardShortcuts({
    searchInputRef,
    currentTrack: player.current,
    visibleTracks,
    toggle: player.toggle,
    playTracks: (tracks, index) => player.playTracks(tracks, index),
    next: player.next,
    previous: player.previous,
  });

  const openArtist = useCallback(
    (name: string) => {
      setArtist(name);
      setAlbum(null);
      setBrowse('tracks');
      if (playlistId) navigate('/music');
    },
    [setArtist, setAlbum, setBrowse, playlistId, navigate],
  );

  const openAlbum = useCallback(
    (name: string, albumArtist: string | null) => {
      setAlbum(name);
      setArtist(albumArtist);
      setBrowse('tracks');
      if (playlistId) navigate('/music');
    },
    [setAlbum, setArtist, setBrowse, playlistId, navigate],
  );

  const playingId = player.current?.id ?? null;
  const trackCount = playlistId ? playlistTracks.length : total;

  // Stable callbacks for child components — prevents defeating memo()
  const handleBrowseChange = useCallback(
    (b: 'tracks' | 'artists' | 'albums' | 'playlists') => {
      if (playlistId) navigate('/music?view=library');
      else setMusicView('library');
      setBrowse(b);
    },
    [setBrowse, playlistId, navigate, setMusicView],
  );

  const handleOpenLibrary = useCallback(() => {
    resetFilters();
    setMusicView('library');
  }, [setMusicView, resetFilters]);

  const handleOpenListen = useCallback(() => {
    if (playlistId) navigate('/music');
    else setMusicView('listen');
  }, [playlistId, navigate, setMusicView]);

  const handleFolderClick = useCallback(
    (id: string | null) => {
      if (playlistId) navigate('/music?view=library');
      else setMusicView('library');
      setFolderId(id);
      setArtist(null);
      setAlbum(null);
      setBrowse('tracks');
    },
    [
      setMusicView,
      setFolderId,
      setArtist,
      setAlbum,
      setBrowse,
      playlistId,
      navigate,
    ],
  );

  const handleSetFolderId = useCallback(
    (id: string | null) => {
      setFolderId(id);
      if (id === null) {
        setArtist(null);
        setAlbum(null);
      }
    },
    [setFolderId, setArtist, setAlbum],
  );

  const handleSortChange = useCallback(
    (s: string) => setSort(s as any),
    [setSort],
  );

  const handleToggleAscending = useCallback(
    () => setAscending((v) => !v),
    [setAscending],
  );

  const handlePlayAll = useCallback(
    () => void player.playTracks(visibleTracks, 0),
    [player, visibleTracks],
  );

  const handleDeletePlaylist = useCallback(() => {
    if (playlistId && activePlaylist) {
      void deletePlaylistInLibrary(activePlaylist.id);
    }
  }, [playlistId, activePlaylist, deletePlaylistInLibrary]);

  const handlePlayTrack = useCallback(
    (track: any, index: number) => void player.playTracks(visibleTracks, index),
    [player, visibleTracks],
  );

  const handleEnqueue = useCallback(
    (track: any, mode: any) => player.enqueue(track, mode),
    [player],
  );

  const handlePlaylistClick = useCallback(
    (id: string) => navigate(`/music/${id}`),
    [navigate],
  );

  const handleRemoveLastTrack = useCallback(() => {
    if (visibleTracks.length > 0) {
      void removeFromPlaylist(visibleTracks[visibleTracks.length - 1].id);
    }
  }, [visibleTracks, removeFromPlaylist]);

  const handlePreviewEnqueue = useCallback(
    (track: any) => player.enqueue(track, 'end'),
    [player],
  );

  const handlePreviewPlay = useCallback(
    (track: any) => player.playTrack(track),
    [player],
  );

  const handleCreatePlaylist = useCallback(
    async (name: string) => {
      await createPlaylistInLibrary(name);
    },
    [createPlaylistInLibrary],
  );

  const handleAddFolder = useCallback(() => void addFolder(), [addFolder]);

  const handleRemoveFolder = useCallback(
    (id: string) => void removeFolder(id),
    [removeFolder],
  );

  const handleStartScan = useCallback(() => void startScan(), [startScan]);

  const handleCancelScan = useCallback(() => void cancelScan(), [cancelScan]);

  const handleCopilotClick = useCallback(
    () => setCopilotOpen(true),
    [setCopilotOpen],
  );

  const handleSearchFocus = useCallback((ref: HTMLInputElement | null) => {
    searchInputRef.current = ref;
  }, []);

  const handleCreatePlaylistClick = useCallback(() => setCreateOpen(true), []);

  const openAudioTab = useCallback((tab: NowPlayingTab) => {
    setSheetTab(tab);
    setSheetOpen(true);
  }, []);

  const handleScenesClick = useCallback(
    () => openAudioTab('scenes'),
    [openAudioTab],
  );

  const handleAddToPlaylistChange = useCallback(
    (open: boolean) => !open && setAddToPlaylist(null),
    [],
  );

  const handlePreviewChange = useCallback(
    (open: boolean) => !open && setPreview(null),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header — title, search, facet pills, library actions, scan progress */}
      <MusicHeader
        view={view}
        onViewChange={setMusicView}
        browse={browse}
        query={query}
        onQueryChange={setQuery}
        onSearchFocus={handleSearchFocus}
        facets={facets}
        onArtistClick={openArtist}
        scan={scan}
        onCopilotClick={handleCopilotClick}
        onAddFolder={handleAddFolder}
        onScan={handleStartScan}
        onCancelScan={handleCancelScan}
        onClearScan={clearScan}
        playlistId={playlistId}
        artist={artist}
        album={album}
      />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — browse rail, folders, playlists, scenes */}
        <MusicSidebar
          view={view}
          onListenClick={handleOpenListen}
          browse={browse}
          onBrowseChange={handleBrowseChange}
          playlistId={playlistId}
          onPlaylistClick={handlePlaylistClick}
          folderId={folderId}
          onFolderClick={handleFolderClick}
          folders={folders}
          onAddFolder={handleAddFolder}
          onRemoveFolder={handleRemoveFolder}
          playlists={playlists}
          onCreatePlaylist={handleCreatePlaylistClick}
          facets={facets}
          total={total}
          onResetFilters={resetFilters}
          onScenesClick={handleScenesClick}
        />

        {view === 'listen' ? (
          <main className="flex min-w-0 flex-1 flex-col">
            <MusicHome onBrowseLibrary={handleOpenLibrary} />
          </main>
        ) : (
          <main className="flex min-w-0 flex-1 flex-col">
            <MusicFilterBar
              heading={heading}
              trackCount={trackCount}
              query={query}
              artist={artist}
              album={album}
              folderId={folderId}
              folders={folders}
              browse={browse}
              playlistId={playlistId}
              visibleTracksLength={visibleTracks.length}
              onSetFolderId={handleSetFolderId}
              onSetArtist={setArtist}
              onSetAlbum={setAlbum}
              onResetFilters={resetFilters}
              sort={sort}
              onSortChange={handleSortChange}
              ascending={ascending}
              onToggleAscending={handleToggleAscending}
              onPlayAll={handlePlayAll}
              onDeletePlaylist={handleDeletePlaylist}
            />

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-3">
                {browse === 'tracks' || playlistId ? (
                  <>
                    <TrackList
                      tracks={visibleTracks}
                      loading={!playlistId && loading}
                      currentTrackId={playingId}
                      playing={player.playing}
                      emptyTitle={
                        folders.length === 0
                          ? 'Your library is empty'
                          : 'No tracks match this filter'
                      }
                      emptyDescription={
                        folders.length === 0
                          ? 'Add a folder to index the music already on this machine. Nothing is uploaded.'
                          : 'Try clearing the search or the artist/album filter.'
                      }
                      onPlay={handlePlayTrack}
                      onEnqueue={handleEnqueue}
                      onAddToPlaylist={setAddToPlaylist}
                      onPreview={setPreview}
                    />
                    {playlistId && visibleTracks.length > 0 && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={handleRemoveLastTrack}
                        >
                          <Trash2Icon className="size-3" /> Remove last track
                        </Button>
                      </div>
                    )}
                  </>
                ) : browse === 'artists' ? (
                  <ArtistGrid artists={filteredArtists} onSelect={openArtist} />
                ) : browse === 'albums' ? (
                  <AlbumGrid albums={filteredAlbums} onSelect={openAlbum} />
                ) : (
                  <PlaylistGrid
                    playlists={playlists}
                    onSelect={handlePlaylistClick}
                    onCreatePlaylist={handleCreatePlaylistClick}
                  />
                )}
              </div>
            </ScrollArea>
          </main>
        )}

        <NowPlaying
          panel
          className="hidden w-80 shrink-0 border-l border-border/60 xl:flex"
        />
      </div>

      {/* Mobile bottom transport */}
      <MusicFooter onOpenTab={openAudioTab} />

      {/* Audio queue dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="flex h-[80vh] flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <HeadphonesIcon className="size-4 text-primary" /> Audio
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Playback keeps running anywhere in Qeda.
            </DialogDescription>
          </DialogHeader>
          <NowPlaying
            key={sheetTab}
            initialTab={sheetTab}
            className="min-h-0 flex-1"
          />
        </DialogContent>
      </Dialog>

      <MusicCopilotSheet open={copilotOpen} onOpenChange={setCopilotOpen} />

      <AddToPlaylistDialog
        track={addToPlaylist}
        open={Boolean(addToPlaylist)}
        onOpenChange={handleAddToPlaylistChange}
      />

      <PreviewFileDialog
        track={preview}
        onOpenChange={handlePreviewChange}
        onEnqueue={handlePreviewEnqueue}
        onPlay={handlePreviewPlay}
      />

      <CreatePlaylistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreatePlaylist}
      />
    </div>
  );
}
