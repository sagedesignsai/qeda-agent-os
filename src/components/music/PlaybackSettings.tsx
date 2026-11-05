/**
 * components/music/PlaybackSettings.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Crossfade and ducking, explained in the place they are changed.
 *
 * Ducking is the setting users are least likely to know they want: music plays,
 * the rain gets quieter, and the result feels mastered instead of layered. The
 * slider copy says that explicitly because a bare "duck dB" is meaningless.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useMusicPlayer } from '@/hooks/use-music-player';

export interface PlaybackSettingsProps {
  className?: string;
}

export function PlaybackSettings({ className }: PlaybackSettingsProps) {
  const { crossfadeSec, duckDb, setCrossfadeSec, setDuckDb } = useMusicPlayer();

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Crossfade</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {crossfadeSec === 0 ? 'Off' : `${crossfadeSec.toFixed(1)}s`}
          </span>
        </div>
        <Slider
          value={[Math.round(crossfadeSec * 10)]}
          onValueChange={([value]) => setCrossfadeSec(value / 10)}
          max={120}
          step={1}
          aria-label="Crossfade length"
        />
        <p className="text-[10px] text-muted-foreground">
          Tracks blend instead of cutting. Long fades are capped at a third of a
          short track so nothing is swallowed.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            Duck ambience under music
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {duckDb === 0 ? 'Off' : `${duckDb.toFixed(0)} dB`}
          </span>
        </div>
        <Slider
          value={[Math.round(Math.abs(duckDb))]}
          onValueChange={([value]) => setDuckDb(-value)}
          max={30}
          step={1}
          aria-label="Soundscape ducking"
        />
        <p className="text-[10px] text-muted-foreground">
          Lowers the rain and noise while a track plays, then brings them back on
          pause. 0 dB disables it.
        </p>
      </div>
    </div>
  );
}
