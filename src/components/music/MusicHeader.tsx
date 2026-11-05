/**
 * components/music/MusicHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Header: title, quick artist pills, search, and library actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo, useMemo } from 'react';
import {
  FolderPlusIcon,
  HeadphonesIcon,
  LibraryIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { MusicFacets, MusicScanProgress } from '@/lib/music/types';

export interface MusicHeaderProps {
  view: 'listen' | 'library';
  onViewChange: (view: 'listen' | 'library') => void;
  browse: 'tracks' | 'artists' | 'albums' | 'playlists';
  query: string;
  onQueryChange: (query: string) => void;
  onSearchFocus: (ref: HTMLInputElement | null) => void;
  facets: MusicFacets;
  onArtistClick: (name: string) => void;
  scan: MusicScanProgress | null;
  onCopilotClick: () => void;
  onAddFolder: () => void;
  onScan: () => void;
  onCancelScan: () => void;
  onClearScan: () => void;
  playlistId?: string | null;
  artist?: string | null;
  album?: string | null;
}

export function MusicHeaderImpl({
  view,
  onViewChange,
  browse,
  query,
  onQueryChange,
  onSearchFocus,
  facets,
  onArtistClick,
  scan,
  onCopilotClick,
  onAddFolder,
  onScan,
  onCancelScan,
  onClearScan,
  playlistId,
  artist,
  album,
}: MusicHeaderProps) {
  const scanning = scan?.phase === 'scanning';
  const discovering = scanning && scan?.stage === 'discovering';
  const scanPercent =
    scan && scan.total > 0 ? Math.round((scan.scanned / scan.total) * 100) : 0;

  // Memoize the top 3 artists to avoid creating a new array reference on every render
  const topArtists = useMemo(
    () => facets.artists.slice(0, 3),
    [facets.artists],
  );

  return (
    <header className="flex flex-col gap-2 border-b border-border/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <HeadphonesIcon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {view === 'listen' ? 'Listen' : 'Music library'}
            </h1>
            <p className="truncate text-[10px] text-muted-foreground">
              {view === 'listen'
                ? 'Focus music and soundscapes'
                : 'Your local collection · plays anywhere in Qeda'}
            </p>
          </div>
        </div>

        {/* Quick filter pills for top artists when viewing tracks. */}
        {view === 'library' &&
          browse === 'tracks' &&
          !playlistId &&
          !artist &&
          !album && (
            <div className="flex flex-wrap items-center gap-1.5">
              {topArtists.map((row) => (
                <Button
                  key={row.name}
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-1.5 text-[10px]"
                  onClick={() => onArtistClick(row.name)}
                  title={`${row.count} track${row.count === 1 ? '' : 's'}`}
                >
                  👤 {row.name.slice(0, 20)}
                  {row.name.length > 20 ? '…' : ''}
                </Button>
              ))}
            </div>
          )}

        {view === 'library' && (
          <div className="relative ml-auto w-full max-w-[18rem]">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={(el) => {
                onSearchFocus(el);
              }}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search title, artist, album…"
              className="h-7 pl-7 text-[11px]"
            />
            {query && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1/2 right-0.5 size-6 -translate-y-1/2 text-muted-foreground"
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
        )}

        <div
          className={cn(
            'flex items-center gap-1',
            view === 'listen' && 'ml-auto',
          )}
        >
          {view === 'listen' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => onViewChange('library')}
            >
              <LibraryIcon className="size-3" /> Browse library
            </Button>
          )}
          {view === 'library' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => onViewChange('listen')}
            >
              <HeadphonesIcon className="size-3" /> Listen
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={onCopilotClick}
          >
            <SparklesIcon className="size-3 text-primary" /> Copilot
          </Button>
          {view === 'library' && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={onAddFolder}
              >
                <FolderPlusIcon className="size-3" /> Add folder
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => (scanning ? onCancelScan() : onScan())}
              >
                {scanning ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-3" />
                )}
                {scanning ? 'Cancel scan' : 'Rescan'}
              </Button>
            </>
          )}
        </div>
      </div>

      {scan && (scanning || scan.phase !== 'done') && (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
          <Progress
            value={scanning ? (discovering ? 0 : scanPercent) : 100}
            className={cn('h-1.5 flex-1', discovering && 'animate-pulse')}
          />
          <span
            className="shrink-0 text-[10px] text-muted-foreground"
            aria-live="polite"
          >
            {scanning
              ? discovering
                ? `Finding files… ${scan.total.toLocaleString()}`
                : [
                    `${scan.scanned.toLocaleString()}/${scan.total.toLocaleString()}`,
                    `${scan.added.toLocaleString()} new`,
                    scan.unchanged
                      ? `${scan.unchanged.toLocaleString()} unchanged`
                      : null,
                    scan.failed
                      ? `${scan.failed.toLocaleString()} unreadable`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
              : scan.phase === 'cancelled'
                ? 'Scan cancelled'
                : (scan.error ?? 'Scan finished')}
          </span>
          {!scanning && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground"
              onClick={onClearScan}
              aria-label="Dismiss scan status"
            >
              <XIcon className="size-3" />
            </Button>
          )}
        </div>
      )}
    </header>
  );
}

export const MusicHeader = memo(MusicHeaderImpl);
