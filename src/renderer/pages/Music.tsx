/**
 * pages/Music.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The music library surface: browse rail, track table, now-playing panel.
 *
 * Querying and library actions live in `useMusicLibrary`, playback lives in the
 * app-wide store, and the right rail is `NowPlaying` (shared with the dock). The
 * page is layout plus the dialogs that only make sense here.
 *
 * Layout is three columns on wide screens and collapses to a single column with
 * a sticky transport below `xl`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  AlbumIcon,
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  Disc3Icon,
  FolderIcon,
  FolderPlusIcon,
  HeadphonesIcon,
  LibraryIcon,
  ListMusicIcon,
  Loader2Icon,
  MicVocalIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { SORT_LABELS, useMusicLibrary } from '@/hooks/use-music-library';
import { AddToPlaylistDialog } from '@/components/music/AddToPlaylistDialog';
import { MusicArtwork } from '@/components/music/MusicArtwork';
import { MusicCopilotSheet } from '@/components/music/MusicCopilotSheet';
import { NowPlaying } from '@/components/music/NowPlaying';
import { PlayerTransport } from '@/components/music/PlayerTransport';
import { TrackList } from '@/components/music/TrackList';
import { hueForId, formatTotalDuration } from '@/lib/music/format';
import { musicMediaUrl } from '@/lib/music/media';
import type { LibrarySort, MusicTrack } from '@/lib/music/types';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function gradientFor(id: string): string {
  const hue = hueForId(id);
  return `linear-gradient(140deg, hsl(${hue} 46% 34%), hsl(${(hue + 52) % 360} 38% 16%))`;
}

export default function Music() {
  const navigate = useNavigate();
  const player = useMusicPlayer();
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
  const [playlistName, setPlaylistName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const copilotOpen = searchParams.get('copilot') === '1';
  const setCopilotOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set('copilot', '1');
    else next.delete('copilot');
    setSearchParams(next, { replace: true });
  };

  const createPlaylist = async () => {
    if (!playlistName.trim()) return;
    setCreating(true);
    try {
      const playlist = await createPlaylistInLibrary(playlistName);
      if (playlist) {
        setPlaylistName('');
        setCreateOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const deletePlaylist = async (id: string) => {
    await deletePlaylistInLibrary(id);
  };

  const railItem = (
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void,
    trailing?: React.ReactNode,
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );

  const openArtist = (name: string) => {
    setArtist(name);
    setAlbum(null);
    setBrowse('tracks');
    if (playlistId) navigate('/music');
  };

  const openAlbum = (name: string, albumArtist: string | null) => {
    setAlbum(name);
    setArtist(albumArtist);
    setBrowse('tracks');
    if (playlistId) navigate('/music');
  };

  const playingId = player.current?.id ?? null;
  const scanning = scan?.phase === 'scanning';
  const scanPercent =
    scan && scan.total > 0
      ? Math.round((scan.scanned / scan.total) * 100)
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex flex-col gap-3 border-b border-border/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HeadphonesIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">
                Music
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Local library · plays anywhere in Qeda
              </p>
            </div>
          </div>

          <div className="relative ml-auto w-full max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, artist, album…"
              className="h-8 pl-8 text-xs"
            />
            {query && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1/2 right-1 size-6 -translate-y-1/2 text-muted-foreground"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setCopilotOpen(true)}
            >
              <SparklesIcon className="size-3.5 text-primary" /> Copilot
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void addFolder()}
            >
              <FolderPlusIcon className="size-3.5" /> Add folder
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void (scanning ? cancelScan() : startScan())}
            >
              {scanning ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              {scanning ? 'Cancel scan' : 'Rescan'}
            </Button>
          </div>
        </div>

        {scan && (scanning || scan.phase !== 'done') && (
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <Progress
              value={scanning ? scanPercent : 100}
              className="h-1.5 flex-1"
            />
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {scanning
                ? `${scan.scanned}/${scan.total} · ${scan.added} new`
                : scan.phase === 'cancelled'
                  ? 'Scan cancelled'
                  : scan.error ?? 'Scan finished'}
            </span>
            {!scanning && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground"
                onClick={clearScan}
                aria-label="Dismiss scan status"
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border/60 md:flex">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-3">
              <section className="flex flex-col gap-1">
                {railItem(
                  'All tracks',
                  <LibraryIcon className="size-3.5" />,
                  !playlistId &&
                    browse === 'tracks' &&
                    !folderId &&
                    !artist &&
                    !album,
                  () => resetFilters(),
                  <span className="text-[10px] text-muted-foreground/70">
                    {total}
                  </span>,
                )}
                {railItem(
                  'Artists',
                  <MicVocalIcon className="size-3.5" />,
                  !playlistId && browse === 'artists',
                  () => {
                    setBrowse('artists');
                    if (playlistId) navigate('/music');
                  },
                  <span className="text-[10px] text-muted-foreground/70">
                    {facets.artists.length}
                  </span>,
                )}
                {railItem(
                  'Albums',
                  <Disc3Icon className="size-3.5" />,
                  !playlistId && browse === 'albums',
                  () => {
                    setBrowse('albums');
                    if (playlistId) navigate('/music');
                  },
                  <span className="text-[10px] text-muted-foreground/70">
                    {facets.albums.length}
                  </span>,
                )}
                {railItem(
                  'Playlists',
                  <ListMusicIcon className="size-3.5" />,
                  !playlistId && browse === 'playlists',
                  () => {
                    setBrowse('playlists');
                    if (playlistId) navigate('/music');
                  },
                  <span className="text-[10px] text-muted-foreground/70">
                    {playlists.length}
                  </span>,
                )}
              </section>

              <section className="flex flex-col gap-1">
                <div className="flex items-center justify-between px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Folders
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 text-muted-foreground"
                    onClick={() => void addFolder()}
                    aria-label="Add folder"
                  >
                    <PlusIcon className="size-3" />
                  </Button>
                </div>
                {folders.length === 0 && (
                  <p className="px-2 py-1 text-[11px] text-muted-foreground/70">
                    No folders watched.
                  </p>
                )}
                {folders.map((folder) =>
                  railItem(
                    folder.path.split(/[\\/]/).filter(Boolean).pop() ??
                      folder.path,
                    <FolderIcon className="size-3.5" />,
                    folderId === folder.id,
                    () => {
                      setFolderId(folder.id);
                      setArtist(null);
                      setAlbum(null);
                      setBrowse('tracks');
                      if (playlistId) navigate('/music');
                    },
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground/70">
                        {folder.track_count}
                      </span>
                      <Trash2Icon
                        className="size-3 text-transparent transition-colors group-hover:text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeFolder(folder.id);
                        }}
                      />
                    </span>,
                  ),
                )}
              </section>

              <section className="flex flex-col gap-1">
                <div className="flex items-center justify-between px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Playlists
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 text-muted-foreground"
                    onClick={() => setCreateOpen(true)}
                    aria-label="New playlist"
                  >
                    <PlusIcon className="size-3" />
                  </Button>
                </div>
                {playlists.length === 0 && (
                  <p className="px-2 py-1 text-[11px] text-muted-foreground/70">
                    None yet.
                  </p>
                )}
                {playlists.map((playlist) =>
                  railItem(
                    playlist.name,
                    <ListMusicIcon className="size-3.5" />,
                    playlist.id === playlistId,
                    () => navigate(`/music/${playlist.id}`),
                    <span className="text-[10px] text-muted-foreground/70">
                      {playlist.track_count}
                    </span>,
                  ),
                )}
              </section>

              <Separator />
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-gradient-to-br from-primary/10 to-transparent px-2.5 py-2 text-left transition-colors hover:border-primary/40"
              >
                <SparklesIcon className="size-3.5 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium text-foreground">
                    Scenes
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    Soundscape + music rituals
                  </span>
                </span>
              </button>
            </div>
          </ScrollArea>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {heading}
              </h2>
              {(artist || album || folderId || playlistId) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                  onClick={resetFilters}
                >
                  <XIcon className="size-3" /> Clear
                </Button>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {playlistId ? playlistTracks.length : total} track
              {(playlistId ? playlistTracks.length : total) === 1 ? '' : 's'}
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              {browse === 'tracks' && !playlistId && (
                <>
                  <Select
                    value={sort}
                    onValueChange={(value) => setSort(value as LibrarySort)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 w-[7.5rem] text-[11px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SORT_LABELS) as LibrarySort[]).map((key) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {SORT_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setAscending((value) => !value)}
                    aria-label={
                      ascending ? 'Sort descending' : 'Sort ascending'
                    }
                  >
                    {ascending ? (
                      <ArrowDownAZIcon className="size-3.5" />
                    ) : (
                      <ArrowUpAZIcon className="size-3.5" />
                    )}
                  </Button>
                </>
              )}

              {visibleTracks.length > 0 && (
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() => void player.playTracks(visibleTracks, 0)}
                >
                  <PlayIcon className="size-3 fill-current" /> Play all
                </Button>
              )}

              {playlistId && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    activePlaylist && void deletePlaylist(activePlaylist.id)
                  }
                  aria-label="Delete playlist"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

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
                    onPlay={(track, index) =>
                      void player.playTracks(visibleTracks, index)
                    }
                    onEnqueue={(track, mode) => player.enqueue(track, mode)}
                    onAddToPlaylist={setAddToPlaylist}
                    onPreview={setPreview}
                  />
                  {playlistId && visibleTracks.length > 0 && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          void removeFromPlaylist(
                            visibleTracks[visibleTracks.length - 1].id,
                          )
                        }
                      >
                        <Trash2Icon className="size-3" /> Remove last track
                      </Button>
                    </div>
                  )}
                </>
              ) : browse === 'artists' ? (
                filteredArtists.length === 0 ? (
                  <p className="px-2 py-12 text-center text-xs text-muted-foreground">
                    No artists indexed yet.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredArtists.map((row) => (
                      <button
                        key={row.name}
                        type="button"
                        onClick={() => openArtist(row.name)}
                        className="group flex items-center gap-3 rounded-xl border border-border/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                      >
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white/90"
                          style={{ background: gradientFor(row.name) }}
                        >
                          {initials(row.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {row.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {row.count} track{row.count === 1 ? '' : 's'}
                          </span>
                        </span>
                        <MicVocalIcon className="size-4 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
                      </button>
                    ))}
                  </div>
                )
              ) : browse === 'albums' ? (
                filteredAlbums.length === 0 ? (
                  <p className="px-2 py-12 text-center text-xs text-muted-foreground">
                    No albums indexed yet.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {filteredAlbums.map((row) => (
                      <button
                        key={`${row.name}-${row.artist ?? ''}`}
                        type="button"
                        onClick={() => openAlbum(row.name, row.artist)}
                        className="group flex flex-col gap-2 rounded-xl border border-border/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                      >
                        <span
                          className="flex aspect-square w-full items-center justify-center rounded-lg"
                          style={{
                            background: gradientFor(
                              `${row.name}${row.artist ?? ''}`,
                            ),
                          }}
                        >
                          <AlbumIcon className="size-7 text-white/70" />
                        </span>
                        <span className="min-w-0 px-0.5">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {row.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {row.artist ?? 'Unknown artist'} · {row.count} track
                            {row.count === 1 ? '' : 's'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Playlists group tracks from anywhere in the library.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={() => setCreateOpen(true)}
                    >
                      <PlusIcon className="size-3" /> New playlist
                    </Button>
                  </div>
                  {playlists.length === 0 ? (
                    <p className="px-2 py-12 text-center text-xs text-muted-foreground">
                      No playlists yet. Create one, then add tracks from the
                      library or the queue.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {playlists.map((playlist) => (
                        <button
                          key={playlist.id}
                          type="button"
                          onClick={() => navigate(`/music/${playlist.id}`)}
                          className="group flex items-center gap-3 rounded-xl border border-border/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ListMusicIcon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {playlist.name}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {playlist.track_count} track
                              {playlist.track_count === 1 ? '' : 's'}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </main>

        <NowPlaying className="hidden w-80 shrink-0 border-l border-border/60 xl:flex" />
      </div>

      <div className="border-t border-border/60 bg-card/60 xl:hidden">
        <PlayerTransport
          compact
          className="mx-auto w-full max-w-3xl"
          onOpenQueue={() => setSheetOpen(true)}
        />
        <div className="flex items-center justify-center gap-1 pb-2">
          {(
            [
              ['Queue', ListMusicIcon],
              ['Scenes', SparklesIcon],
              ['Audio', HeadphonesIcon],
            ] as const
          ).map(([label, Icon]) => (
            <Button
              key={label}
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
              onClick={() => setSheetOpen(true)}
            >
              <Icon className="size-3" /> {label}
            </Button>
          ))}
        </div>
      </div>

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
          <NowPlaying className="min-h-0 flex-1" />
        </DialogContent>
      </Dialog>

      <MusicCopilotSheet
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
      />

      <AddToPlaylistDialog
        track={addToPlaylist}
        open={Boolean(addToPlaylist)}
        onOpenChange={(open) => !open && setAddToPlaylist(null)}
      />

      {/* Raw-file preview. This is the escape hatch for checking a file plays
          before adding its album; library playback goes through the engine. */}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.title}</DialogTitle>
            <DialogDescription className="truncate">
              {preview
                ? [preview.artist, preview.album].filter(Boolean).join(' — ')
                : ''}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <MusicArtwork
                  trackId={preview.id}
                  title={preview.title}
                  className="size-14"
                />
                <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  <p className="truncate">{preview.path}</p>
                  <p className="mt-1">
                    {preview.codec ?? 'unknown codec'}
                    {preview.bitrate
                      ? ` · ${Math.round(preview.bitrate / 1000)} kbps`
                      : ''}{' '}
                    · {formatTotalDuration(preview.duration_ms)}
                  </p>
                </div>
              </div>
              <PreviewPlayer track={preview} />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (preview) {
                  player.enqueue(preview, 'end');
                  toast.success('Added to queue');
                }
                setPreview(null);
              }}
            >
              Add to queue
            </Button>
            <Button
              onClick={() => {
                if (preview) void player.playTrack(preview);
                setPreview(null);
              }}
            >
              <PlayIcon className="mr-1.5 size-3.5 fill-current" /> Play in library
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
            <DialogDescription>
              Give it a name now; add tracks from the library afterwards.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
            placeholder="Playlist name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createPlaylist();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createPlaylist()}
              disabled={creating || !playlistName.trim()}
            >
              {creating && (
                <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The preview player is a plain `<audio>` through the same protocol host.
 *
 * It deliberately does not go through the engine: previewing a file should not
 * disturb the queue, and stopping the dialog must not leave the main mixer
 * routed to a track the user only wanted to audition.
 */
function PreviewPlayer({ track }: { track: MusicTrack }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      ref.current?.pause();
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <audio
        ref={ref}
        controls
        autoPlay
        preload="metadata"
        src={musicMediaUrl(track.id)}
        className="w-full"
      />
      <p className="text-[10px] text-muted-foreground">
        Preview uses the same stream as the player, so a broken file shows here
        before it joins the queue.
      </p>
    </div>
  );
}
