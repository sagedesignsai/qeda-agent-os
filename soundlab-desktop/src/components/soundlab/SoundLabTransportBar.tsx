/**
 * components/soundlab/SoundLabTransportBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The DAW transport toolbar: Play/Pause, Stop, BPM, Key, Band, Mode toggle,
 * Bar:Beat counter, Undo/Redo, Autosave status. Keyboard shortcuts are
 * registered here and nowhere else.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';
import {
  PlayIcon,
  PauseIcon,
  SquareIcon,
  Undo2Icon,
  Redo2Icon,
  RepeatIcon,
  LayoutGridIcon,
  CheckCircleIcon,
  LoaderIcon,
  AlertCircleIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  soundLabStore,
  useSoundLabSession,
  useSoundLabState,
} from '@/hooks/use-soundlab-store';
import { getEngine } from '@/hooks/use-soundlab';
import type { SaveStatus } from '@/hooks/use-soundlab';

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface BeatCounterProps {
  className?: string;
}

/** Reads the audio clock directly so the counter stays aligned with the playhead. */
function BeatCounter({ className }: BeatCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let animationFrame = 0;
    let previousLabel = '';
    const update = () => {
      const beat =
        getEngine().getPlayheadBeat() ?? soundLabStore.getState().playheadBeat;
      const bar = Math.floor(beat / 4) + 1;
      const step = (Math.floor(beat) % 4) + 1;
      const label = `${String(bar).padStart(3, '0')}:${step}`;
      if (ref.current && label !== previousLabel) {
        ref.current.textContent = label;
        previousLabel = label;
      }
      animationFrame = requestAnimationFrame(update);
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, []);
  return (
    <span
      ref={ref}
      className={cn(
        'font-mono text-sm tabular-nums text-foreground/80 tracking-wider',
        className,
      )}
    >
      001:1
    </span>
  );
}

function SaveDot({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center">
          {status === 'saving' && (
            <LoaderIcon className="size-3 animate-spin text-amber-400" />
          )}
          {status === 'saved' && (
            <CheckCircleIcon className="size-3 text-emerald-400" />
          )}
          {status === 'error' && (
            <AlertCircleIcon className="size-3 text-destructive" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved'}
        {status === 'error' && 'Save failed'}
      </TooltipContent>
    </Tooltip>
  );
}

interface SoundLabTransportBarProps {
  saveStatus: SaveStatus;
  onPlay: () => Promise<void>;
  onPause: () => void;
  onStop: () => void;
  copilotOpen?: boolean;
  onToggleCopilot?: () => void;
}

export function SoundLabTransportBar({
  saveStatus,
  onPlay,
  onPause,
  onStop,
  copilotOpen,
  onToggleCopilot,
}: SoundLabTransportBarProps) {
  const session = useSoundLabSession();
  const { isPlaying, playMode } = useSoundLabState();

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;

      if (e.code === 'Space') {
        e.preventDefault();
        void onPlay();
      }
      if (e.key === 'Escape' || e.code === 'Numpad0') {
        onStop();
      }
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        soundLabStore.undo();
      }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        soundLabStore.redo();
      }
      if (e.key.toLowerCase() === 'l') {
        soundLabStore.setPlayMode(playMode === 'song' ? 'pattern' : 'song');
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onToggleCopilot?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlay, onStop, onToggleCopilot, playMode]);

  if (!session) return null;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 bg-card/80 px-3 backdrop-blur-sm">
      {/* Transport buttons */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn('size-7', isPlaying && 'text-emerald-400')}
              onClick={() => (isPlaying ? onPause() : void onPlay())}
            >
              {isPlaying ? (
                <PauseIcon className="size-3.5" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={onStop}
            >
              <SquareIcon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Stop (Esc)
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" />

      {/* Beat counter */}
      <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-0.5">
        <BeatCounter />
      </div>

      <Separator orientation="vertical" />

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          BPM
        </span>
        <input
          type="number"
          min={40}
          max={220}
          value={session.bpm}
          onChange={(e) => {
            const bpm = Number(e.target.value);
            if (!Number.isFinite(bpm)) return;
            soundLabStore.setBpm(bpm);
            getEngine().updateBpm(bpm);
          }}
          className="w-14 rounded border border-border/40 bg-background/60 px-1.5 py-0.5 text-center text-xs font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <Separator orientation="vertical" />

      {/* Key */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Key
        </span>
        <Select
          value={session.keySignature}
          onValueChange={(v) => soundLabStore.setKeySignature(v)}
        >
          <SelectTrigger className="h-6 w-16 border-border/40 bg-background/60 text-xs px-2 py-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KEYS.map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator orientation="vertical" />

      {/* Play mode toggle */}
      <div className="flex items-center gap-1.5">
        <ToggleGroup
          type="single"
          value={playMode}
          onValueChange={(v) =>
            v && soundLabStore.setPlayMode(v as 'song' | 'pattern')
          }
          spacing={0}
          size="sm"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="song"
                variant="outline"
                className="h-6 px-2 text-[10px]"
              >
                <LayoutGridIcon className="size-3 mr-1" />
                Song
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Song mode (L)
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="pattern"
                variant="outline"
                className="h-6 px-2 text-[10px]"
              >
                <RepeatIcon className="size-3 mr-1" />
                Pattern
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Pattern mode (L)
            </TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={session.loopEnabled ? 'secondary' : 'ghost'}
            className={cn(
              'h-6 gap-1 px-2 text-[10px]',
              session.loopEnabled && 'text-primary',
            )}
            aria-pressed={session.loopEnabled}
            onClick={() => soundLabStore.toggleLoop()}
          >
            <RepeatIcon className="size-3" />
            Loop
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {session.loopEnabled
            ? `Looping beats ${session.loopStartBeat}–${session.loopEndBeat}`
            : `Enable loop for beats ${session.loopStartBeat}–${session.loopEndBeat}`}
        </TooltipContent>
      </Tooltip>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground"
              onClick={() => soundLabStore.undo()}
              disabled={!soundLabStore.canUndo()}
            >
              <Undo2Icon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Undo (⌘Z)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground"
              onClick={() => soundLabStore.redo()}
              disabled={!soundLabStore.canRedo()}
            >
              <Redo2Icon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Redo (⌘Y)
          </TooltipContent>
        </Tooltip>
      </div>

      {onToggleCopilot && (
        <>
          <Separator orientation="vertical" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={copilotOpen ? 'default' : 'outline'}
                className={cn(
                  'h-7 gap-1.5 px-2.5 text-xs font-medium cursor-pointer transition-all',
                  copilotOpen
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs'
                    : 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:text-white',
                )}
                onClick={onToggleCopilot}
              >
                <SparklesIcon className="size-3.5 text-violet-400" />
                <span>Copilot</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              AI Neuro-Acoustic Producer (⌘K)
            </TooltipContent>
          </Tooltip>
        </>
      )}

      <SaveDot status={saveStatus} />
    </div>
  );
}
