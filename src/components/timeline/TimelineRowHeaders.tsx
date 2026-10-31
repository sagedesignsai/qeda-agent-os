/**
 * components/timeline/TimelineRowHeaders.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The DOM column beside the canvas timeline: one row header per model row.
 *
 * Headers are DOM, not canvas, because they hold focusable controls. They share
 * the canvas's row height and scroll offset so the two columns stay locked
 * together without either one measuring the other.
 *
 * In Dope Sheet mode, rows are hierarchical: collapsible node groups with
 * indented property channel rows.
 */

import { ChevronDownIcon, ChevronRightIcon, LockIcon, LockOpenIcon, Trash2Icon, VolumeXIcon } from 'lucide-react';

import { DOPE_ROW_HEIGHT, DOPE_GROUP_HEIGHT, ROW_HEIGHT, RULER_HEIGHT } from '@/lib/timeline/layout';
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
  /** Dope sheet mode: hierarchical rows with collapsible groups. */
  dopeSheet?: boolean;
  /** Collapsed group IDs for dope sheet mode. */
  collapsedGroups?: Set<string>;
  /** Toggle a group's collapsed state. */
  onToggleGroup?: (groupId: string) => void;
};

export function TimelineRowHeaders({
  model,
  selection,
  scrollY = 0,
  onSelect,
  onToggleMute,
  onToggleLock,
  onRemove,
  dopeSheet,
  collapsedGroups,
  onToggleGroup,
}: TimelineRowHeadersProps) {
  if (dopeSheet) {
    return (
      <div className="relative h-full w-44 shrink-0 overflow-hidden border-r border-border/60 bg-sidebar">
        <div className="h-[26px] border-b border-border/60" style={{ height: RULER_HEIGHT }} />
        <div style={{ transform: `translateY(-${scrollY}px)` }}>
          {renderDopeSheetHeaders(model, selection, collapsedGroups, onToggleGroup)}
        </div>
      </div>
    );
  }

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

function renderDopeSheetHeaders(
  model: TimelineModel,
  selection: TimelineSelection,
  collapsedGroups: Set<string> | undefined,
  onToggleGroup: ((groupId: string) => void) | undefined,
) {
  // Group rows by their track (which maps to a node in Motion)
  const groups = new Map<string, { row: typeof model.rows[0]; properties: string[] }>();

  for (const item of model.items) {
    const channels = item.channels ?? [];
    for (const channel of channels) {
      const row = model.rows.find((r) => r.id === item.rowId);
      if (!row) continue;
      let group = groups.get(item.rowId);
      if (!group) {
        group = { row, properties: [] };
        groups.set(item.rowId, group);
      }
      if (!group.properties.includes(channel.label)) {
        group.properties.push(channel.label);
      }
    }
  }

  const elements: JSX.Element[] = [];
  let index = 0;

  for (const [groupId, group] of groups) {
    const isCollapsed = collapsedGroups?.has(groupId) ?? false;

    // Group header row
    elements.push(
      <div
        key={`${groupId}:group`}
        className="group flex items-center gap-1 border-b border-border/40 px-2 text-[11px] font-medium hover:bg-accent/30"
        style={{ height: DOPE_GROUP_HEIGHT }}
      >
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onToggleGroup?.(groupId)}
          aria-label={isCollapsed ? `Expand ${group.row.name}` : `Collapse ${group.row.name}`}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="size-3" />
          ) : (
            <ChevronDownIcon className="size-3" />
          )}
        </button>
        <span className="truncate text-foreground">{group.row.name}</span>
        <span className="ml-auto text-[9px] text-muted-foreground/70">
          {group.properties.length} prop{group.properties.length !== 1 ? 's' : ''}
        </span>
      </div>,
    );
    index += 1;

    // Property rows
    if (!isCollapsed) {
      for (const property of group.properties) {
        elements.push(
          <div
            key={`${groupId}:${property}`}
            className="flex items-center gap-1 border-b border-border/20 px-2 pl-7 text-[10px] text-muted-foreground hover:bg-accent/20"
            style={{ height: DOPE_ROW_HEIGHT }}
          >
            <span className="truncate">{property}</span>
          </div>,
        );
        index += 1;
      }
    }
  }

  if (elements.length === 0) {
    return (
      <div className="flex items-center justify-center px-2 text-[10px] text-muted-foreground/50" style={{ height: DOPE_ROW_HEIGHT }}>
        No animated properties
      </div>
    );
  }

  return <>{elements}</>;
}
