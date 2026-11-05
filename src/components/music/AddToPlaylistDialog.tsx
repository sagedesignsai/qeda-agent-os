/**
 * components/music/AddToPlaylistDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Add one track (or a selection) to a playlist, or create a playlist on the
 * spot. The dialog owns its playlist fetch because it is opened from the track
 * table, the queue and the now-playing panel — a parent-owned list would have
 * to be plumbed to all three.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { ListMusicIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIpcEvent } from '@/hooks/use-ipc';
import type { MusicPlaylist, MusicTrack } from '@/lib/music/types';

export interface AddToPlaylistDialogProps {
  track: MusicTrack | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToPlaylistDialog({
  track,
  open,
  onOpenChange,
}: AddToPlaylistDialogProps) {
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await window.electron.ipc.invoke<MusicPlaylist[]>(
        'music:playlists-list',
      );
      setPlaylists(rows ?? []);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  useIpcEvent(
    'music:changed',
    () => {
      if (open) void load();
    },
    [open, load],
  );

  const add = async (playlistId: string) => {
    if (!track) return;
    setBusy(true);
    try {
      await window.electron.ipc.invoke('music:playlist-add-tracks', {
        id: playlistId,
        trackIds: [track.id],
      });
      toast.success('Added to playlist');
      onOpenChange(false);
    } catch {
      toast.error('Could not add the track');
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    if (!track || !name.trim()) return;
    setBusy(true);
    try {
      const playlist = await window.electron.ipc.invoke<MusicPlaylist>(
        'music:playlist-create',
        { name: name.trim() },
      );
      await window.electron.ipc.invoke('music:playlist-add-tracks', {
        id: playlist.id,
        trackIds: [track.id],
      });
      setName('');
      toast.success(`Added to “${playlist.name}”`);
      onOpenChange(false);
    } catch {
      toast.error('Could not create the playlist');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
          <DialogDescription className="truncate">
            {track ? `“${track.title}”` : 'Choose a track first'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-64">
          <div className="flex flex-col gap-1 pr-2">
            {playlists.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No playlists yet. Create the first one below.
              </p>
            )}
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                disabled={busy}
                onClick={() => void add(playlist.id)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <ListMusicIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {playlist.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {playlist.track_count} track
                    {playlist.track_count === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist name"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createAndAdd();
            }}
          />
          <Button
            variant="outline"
            onClick={() => void createAndAdd()}
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
