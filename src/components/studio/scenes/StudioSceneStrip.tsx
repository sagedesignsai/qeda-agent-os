/**
 * components/studio/scenes/StudioSceneStrip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master-story strip shown above the timeline when a project has more than one
 * scene. Scenes are cards in order; drag a card to reorder the story. This is
 * deliberately not a second timeline — the active scene keeps the only editing
 * timeline, and the strip carries order, durations and playback.
 */

import { useState } from 'react';
import {
  GripVerticalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StudioScene } from '@/lib/studio/types';
import { cn } from '@/lib/utils';

export interface StudioSceneStripProps {
  scenes: StudioScene[];
  activeSceneId?: string;
  totalDurationMs: number;
  isStoryPlaying?: boolean;
  onSelectScene: (sceneId: string) => void;
  onReorderScene: (fromIndex: number, toIndex: number) => void;
  onAddScene: () => void;
  onToggleStoryPlayback: () => void;
}

function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export function StudioSceneStrip({
  scenes,
  activeSceneId,
  totalDurationMs,
  isStoryPlaying = false,
  onSelectScene,
  onReorderScene,
  onAddScene,
  onToggleStoryPlayback,
}: StudioSceneStripProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (scenes.length <= 1) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/40 bg-background/30 px-2">
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Story
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {scenes.map((scene, index) => {
          const active = scene.id === activeSceneId;
          return (
            <div
              key={scene.id}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', scene.id);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(event) => {
                if (dragIndex === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOverIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                  onReorderScene(dragIndex, index);
                }
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                'group flex h-6 min-w-32 flex-1 items-center gap-1 rounded border px-1 transition-colors',
                active
                  ? 'border-primary/70 bg-primary/10'
                  : 'border-border/60 bg-muted/20 hover:border-border',
                dragIndex === index && 'opacity-40',
                overIndex === index && dragIndex !== index && 'ring-1 ring-primary/60',
              )}
            >
              <GripVerticalIcon className="size-3 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" />
              <button
                type="button"
                aria-pressed={active}
                title={`Scene ${index + 1}: ${scene.name} · ${formatSeconds(scene.durationMs)}`}
                onClick={() => onSelectScene(scene.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-[10px]"
              >
                <span className="min-w-0 truncate">
                  <span className="mr-1 tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {scene.name}
                </span>
                <span className="shrink-0 tabular-nums text-[9px] text-muted-foreground">
                  {formatSeconds(scene.durationMs)}
                </span>
              </button>
            </div>
          );
        })}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onAddScene}
              aria-label="Add scene"
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Add scene
          </TooltipContent>
        </Tooltip>
      </div>

      <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
        {formatSeconds(totalDurationMs)}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={isStoryPlaying ? 'secondary' : 'ghost'}
            size="icon"
            className={cn(
              'size-6 shrink-0',
              isStoryPlaying
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={onToggleStoryPlayback}
            aria-label={isStoryPlaying ? 'Stop story preview' : 'Play story'}
          >
            {isStoryPlaying ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isStoryPlaying ? 'Stop story preview' : 'Play story from scene 1'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}