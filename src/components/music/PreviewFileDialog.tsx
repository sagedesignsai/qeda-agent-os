/**
 * components/music/PreviewFileDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dialog for previewing a raw audio file before adding it to the queue.
 * Uses a plain <audio> element so it doesn't disturb the main player queue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo, useEffect, useRef } from 'react';
import { PlayIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MusicArtwork } from '@/components/music/MusicArtwork';
import { formatTotalDuration } from '@/lib/music/format';
import { musicMediaUrl } from '@/lib/music/media';
import type { MusicTrack } from '@/lib/music/types';

export interface PreviewFileDialogProps {
  track: MusicTrack | null;
  onOpenChange: (open: boolean) => void;
  onEnqueue: (track: MusicTrack) => void;
  onPlay: (track: MusicTrack) => Promise<void>;
}

function PreviewPlayer({ track }: { track: MusicTrack }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Start playback imperatively so React never sees autoPlay as a JSX prop.
    el.play().catch(() => {
      // Autoplay policy blocked it; the user can hit the native play button.
    });
    return () => {
      el.pause();
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <audio
        ref={ref}
        controls
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

function PreviewFileDialogImpl({
  track,
  onOpenChange,
  onEnqueue,
  onPlay,
}: PreviewFileDialogProps) {
  if (!track) return null;

  return (
    <Dialog open={Boolean(track)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">{track.title}</DialogTitle>
          <DialogDescription className="truncate">
            {[track.artist, track.album].filter(Boolean).join(' — ')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <MusicArtwork trackId={track.id} title={track.title} className="size-14" />
            <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              <p className="truncate">{track.path}</p>
              <p className="mt-1">
                {track.codec ?? 'unknown codec'}
                {track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}{' '}
                · {formatTotalDuration(track.duration_ms)}
              </p>
            </div>
          </div>
          <PreviewPlayer track={track} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onEnqueue(track);
              toast.success('Added to queue');
              onOpenChange(false);
            }}
          >
            Add to queue
          </Button>
          <Button
            onClick={() => {
              void onPlay(track);
              onOpenChange(false);
            }}
          >
            <PlayIcon className="mr-1.5 size-3.5 fill-current" /> Play in library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const PreviewFileDialog = memo(PreviewFileDialogImpl);
