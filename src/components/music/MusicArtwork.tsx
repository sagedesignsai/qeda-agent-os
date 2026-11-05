/**
 * components/music/MusicArtwork.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Cover art with a deterministic fallback.
 *
 * The protocol returns 404 for tracks without an embedded picture, so `onError`
 * is the normal path rather than an error state. The fallback hue is derived
 * from the track id, which keeps a list of unknown albums from looking uniform
 * without shipping placeholder images.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { Music2Icon } from 'lucide-react';
import { hueForId } from '@/lib/music/format';
import { musicArtUrl } from '@/lib/music/media';
import { cn } from '@/lib/utils';

export interface MusicArtworkProps {
  trackId: string | null | undefined;
  title?: string;
  className?: string;
  iconClassName?: string;
}

export function MusicArtwork({
  trackId,
  title,
  className,
  iconClassName,
}: MusicArtworkProps) {
  const [failed, setFailed] = useState(false);

  // A row can be recycled for a different track; the failure state belongs to
  // the id, not to the component instance.
  useEffect(() => {
    setFailed(false);
  }, [trackId]);

  const hue = trackId ? hueForId(trackId) : 260;

  if (!trackId || failed) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground',
          className,
        )}
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${hue} 40% 32%), hsl(${(hue + 48) % 360} 35% 18%))`,
        }}
        aria-hidden
      >
        <Music2Icon className={cn('size-4 opacity-70', iconClassName)} />
      </div>
    );
  }

  return (
    <img
      src={musicArtUrl(trackId)}
      alt={title ? `${title} cover` : 'Album cover'}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 rounded-md bg-muted object-cover',
        className,
      )}
    />
  );
}
