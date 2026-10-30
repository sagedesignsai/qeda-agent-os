/**
 * components/timeline/TimelineRowHeaders.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The DOM column beside the canvas timeline: one row header per model row.
 *
 * Headers are DOM, not canvas, because they hold focusable controls. They share
 * the canvas's row height and scroll offset so the two columns stay locked
 * together without either one measuring the other.
 */

import { LockIcon, LockOpenIcon, Trash2Icon, VolumeXIcon } from 'lucide-react';

import { ROW_HEIGHT, RULER_HEIGHT } from '@/lib/timeline/layout';
import type { TimelineModel, TimelineSelection } from '@/lib/timeline/types';
import { cn } from '@/lib/utils';

export type TimelineRowHeadersProps = {
  model: TimelineModel;
  selection: TimelineSelection;
  scrollY?: number;
  onSelect?: (selection: TimelineSelection) => void;
  onToggleMute?: (rowId: string) => void;
  onToggleLock?: (rowId: string) => void;
  onRemove?: (rowId: string) => void;
};

export function TimelineRowHeaders({
  model,
  selection,
  scrollY = 0,
  onSelect,
  onToggleMute,
  onToggleLock,
  onRemove,
}: TimelineRowHeadersProps) {
  return (
    <div className="relative h-full w-44 shrink-0 overflow-hidden border-r border-border/60 bg-sidebar">
      <div className="h-[26px] border-b border-border/60" style={{ height: RULER_HEIGHT }} />
      <div style={{ transform: `translateY(-${scrollY}px)` }}>
        {model.rows.map((row) => {
          const selected = selection?.rowId === row.id && !selection.itemId && !selection.keyId;
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect?.({ rowId: row.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect?.({ rowId: row.id });
                }
              }}
              className={cn(
                'group flex flex-col justify-center gap-1 border-b border-border/40 px-2',
                selected ? 'bg-accent/60' : 'hover:bg-accent/30',
              )}
              style={{ height: ROW_HEIGHT }}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'truncate text-[11px] font-medium',
                    row.muted ? 'text-muted-foreground/60' : 'text-foreground',
                  )}
                >
                  {row.name}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    title={row.muted ? 'Unmute row' : 'Mute row'}
                    aria-label={row.muted ? 'Unmute row' : 'Mute row'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMute?.(row.id);
                    }}
                    className={cn(
                      'rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground',
                      row.muted && 'text-destructive opacity-100',
                    )}
                  >
                    <VolumeXIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    title={row.locked ? 'Unlock row' : 'Lock row'}
                    aria-label={row.locked ? 'Unlock row' : 'Lock row'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleLock?.(row.id);
                    }}
                    className={cn(
                      'rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground',
                      row.locked && 'text-foreground opacity-100',
                    )}
                  >
                    {row.locked ? <LockIcon className="size-3" /> : <LockOpenIcon className="size-3" />}
                  </button>
                  <button
                    type="button"
                    title="Delete row"
                    aria-label="Delete row"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove?.(row.id);
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground/70">
                {row.muted ? 'Muted' : row.locked ? 'Locked' : 'Track'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
