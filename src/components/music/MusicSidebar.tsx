/**
 * components/music/MusicSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Left sidebar: browse navigation (all tracks, artists, albums, playlists),
 * folder list, and playlist list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from 'react';
import {
  Disc3Icon,
  FolderIcon,
  HeadphonesIcon,
  LibraryIcon,
  ListMusicIcon,
  MicVocalIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type {
  MusicFacets,
  MusicFolder,
  MusicPlaylist,
} from '@/lib/music/types';

export interface MusicSidebarProps {
  view: 'listen' | 'library';
  onListenClick: () => void;
  browse: 'tracks' | 'artists' | 'albums' | 'playlists';
  onBrowseChange: (
    browse: 'tracks' | 'artists' | 'albums' | 'playlists',
  ) => void;
  playlistId?: string | null;
  onPlaylistClick: (id: string) => void;
  folderId: string | null;
  onFolderClick: (id: string | null) => void;
  folders: MusicFolder[];
  onAddFolder: () => void;
  onRemoveFolder: (id: string) => void;
  playlists: MusicPlaylist[];
  onCreatePlaylist: () => void;
  facets: MusicFacets;
  total: number;
  onResetFilters: () => void;
  onScenesClick: () => void;
}

function RailItemImpl({
  label,
  icon,
  active,
  onClick,
  trailing,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
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
}

const RailItem = memo(RailItemImpl);

function MusicSidebarImpl({
  view,
  onListenClick,
  browse,
  onBrowseChange,
  playlistId,
  onPlaylistClick,
  folderId,
  onFolderClick,
  folders,
  onAddFolder,
  onRemoveFolder,
  playlists,
  onCreatePlaylist,
  facets,
  total,
  onResetFilters,
  onScenesClick,
}: MusicSidebarProps) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border/60 md:flex">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-3">
          <section className="flex flex-col gap-1">
            <RailItem
              label="Listen"
              icon={<HeadphonesIcon className="size-3.5" />}
              active={view === 'listen'}
              onClick={onListenClick}
            />
            <RailItem
              label="All tracks"
              icon={<LibraryIcon className="size-3.5" />}
              active={
                view === 'library' &&
                !playlistId &&
                browse === 'tracks' &&
                !folderId
              }
              onClick={() => {
                onResetFilters();
                onBrowseChange('tracks');
              }}
              trailing={
                <span className="text-[10px] text-muted-foreground/70">
                  {total}
                </span>
              }
            />
            <RailItem
              label="Artists"
              icon={<MicVocalIcon className="size-3.5" />}
              active={view === 'library' && !playlistId && browse === 'artists'}
              onClick={() => onBrowseChange('artists')}
              trailing={
                <span className="text-[10px] text-muted-foreground/70">
                  {facets.artists.length}
                </span>
              }
            />
            <RailItem
              label="Albums"
              icon={<Disc3Icon className="size-3.5" />}
              active={view === 'library' && !playlistId && browse === 'albums'}
              onClick={() => onBrowseChange('albums')}
              trailing={
                <span className="text-[10px] text-muted-foreground/70">
                  {facets.albums.length}
                </span>
              }
            />
            <RailItem
              label="Playlists"
              icon={<ListMusicIcon className="size-3.5" />}
              active={
                view === 'library' && !playlistId && browse === 'playlists'
              }
              onClick={() => onBrowseChange('playlists')}
              trailing={
                <span className="text-[10px] text-muted-foreground/70">
                  {playlists.length}
                </span>
              }
            />
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
                onClick={onAddFolder}
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
            {folders.map((folder) => (
              <RailItem
                key={folder.id}
                label={
                  folder.path.split(/[\\/]/).filter(Boolean).pop() ??
                  folder.path
                }
                icon={<FolderIcon className="size-3.5" />}
                active={view === 'library' && folderId === folder.id}
                onClick={() => onFolderClick(folder.id)}
                trailing={
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground/70">
                      {folder.track_count}
                    </span>
                    <Trash2Icon
                      className="size-3 text-transparent transition-colors group-hover:text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveFolder(folder.id);
                      }}
                    />
                  </span>
                }
              />
            ))}
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
                onClick={onCreatePlaylist}
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
            {playlists.map((playlist) => (
              <RailItem
                key={playlist.id}
                label={playlist.name}
                icon={<ListMusicIcon className="size-3.5" />}
                active={playlist.id === playlistId}
                onClick={() => onPlaylistClick(playlist.id)}
                trailing={
                  <span className="text-[10px] text-muted-foreground/70">
                    {playlist.track_count}
                  </span>
                }
              />
            ))}
          </section>

          <Separator />
          <button
            type="button"
            onClick={onScenesClick}
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
  );
}

export const MusicSidebar = memo(MusicSidebarImpl);
