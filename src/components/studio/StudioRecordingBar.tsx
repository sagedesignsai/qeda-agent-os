/**
 * components/studio/StudioRecordingBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating recording indicator pill displayed during an active showcase take.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SquareIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StudioRecordingBarProps {
  seconds: number;
  onStop: () => void;
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function StudioRecordingBar({
  seconds,
  onStop,
}: StudioRecordingBarProps) {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-3 bg-card/95 backdrop-blur-xl border border-rose-500/40 px-4 py-2 rounded-full shadow-[0_10px_35px_-5px_rgba(244,63,94,0.35)] select-none">
        {/* Pulsing Red Dot */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <span className="text-xs font-mono font-bold tracking-wider text-rose-300">
            REC
          </span>
        </div>

        {/* Live Timer */}
        <span className="font-mono text-xs font-medium text-foreground min-w-[42px]">
          {formatTimer(seconds)}
        </span>

        <div className="w-[1px] h-4 bg-border/60" />

        {/* Finish Take Button */}
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-3 text-xs gap-1.5 rounded-full font-medium shadow-sm hover:scale-105 transition-transform"
          onClick={onStop}
        >
          <SquareIcon className="w-3 h-3 fill-current" />
          Finish Take
        </Button>
      </div>
    </div>
  );
}
