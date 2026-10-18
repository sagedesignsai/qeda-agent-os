/**
 * components/correspondence/HarvestReviewGrid.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The review step: every value Harvest proposes, as a plain editable cell.
 *
 * WHY THIS COMPONENT IS THE WHOLE SAFETY STORY
 * Harvest reads a page and proposes contacts. The rule the system is built on is
 * that nothing the extractor produced is ever written — the user's edit is. This
 * grid is where that rule becomes real: it is controlled, so the only rows that
 * can reach `harvest-import` are the ones rendered here after editing, and there is
 * no "auto-import" path anywhere that could bypass it.
 *
 * HOW CONFIDENCE IS SHOWN, AND WHY IT IS NOT A COLOUR
 * The design calls for confidence tinting, but there is no warning token in this
 * design system (only background/foreground/muted/accent/destructive), and using
 * `destructive` for "probably fine, just check it" would overstate the risk. So
 * this follows the convention the codebase already uses for "attached but not
 * confirmed" (see `DocumentDrafterSheet`'s dashed context strip): low-confidence
 * rows and cells are **dashed**, which reads as unfinished rather than wrong. The
 * explanation hangs off the element's `title`, so it is available without a
 * legend nobody reads.
 *
 * A value the model contributed is never merged into a value the text contained
 * (enforced in `lib/harvest.ts`), so a NEW chip is always a genuine guess and
 * never a decoration on something that was actually written down.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import {
  CHANNEL_LABELS,
  CONTACT_CHANNEL_KINDS,
  contactNameDedupeKey,
  type ContactChannelKind,
} from '@/lib/correspondence';
import type { HarvestChannelDraft, HarvestRowDraft } from '@/lib/harvest';

/** Below this the row or cell is marked as needing a second look. */
const ROW_CHECK_THRESHOLD = 0.7;
const CELL_CHECK_THRESHOLD = 0.8;

export interface HarvestReviewGridProps {
  rows: HarvestRowDraft[];
  onChange: (rows: HarvestRowDraft[]) => void;
  /** Names already in the registry for this scope, to flag a likely duplicate. */
  knownNames: string[];
}

/** A blank row the user adds themselves: nothing to check, nothing inferred. */
function emptyRow(): HarvestRowDraft {
  return {
    id: `manual-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6)}`,
    kind: 'organisation',
    name: '',
    role: '',
    notes: '',
    confidence: 1,
    nameOrigin: 'manual',
    inferred: false,
    channels: [
      { kind: 'email', value: '', label: '', confidence: 1, inferred: false },
    ],
  };
}

function emptyChannel(): HarvestChannelDraft {
  return { kind: 'email', value: '', label: '', confidence: 1, inferred: false };
}

export function HarvestReviewGrid({
  rows,
  onChange,
  knownNames,
}: HarvestReviewGridProps) {
  const knownKeys = new Set(knownNames.map(contactNameDedupeKey));

  const patchRow = (id: string, patch: Partial<HarvestRowDraft>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const patchChannel = (
    rowId: string,
    index: number,
    patch: Partial<HarvestChannelDraft>,
  ) => {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              channels: row.channels.map((channel, i) =>
                i === index ? { ...channel, ...patch } : channel,
              ),
            }
          : row,
      ),
    );
  };

  const removeChannel = (rowId: string, index: number) => {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, channels: row.channels.filter((_, i) => i !== index) }
          : row,
      ),
    );
  };

  const addChannel = (rowId: string) => {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, channels: [...row.channels, emptyChannel()] }
          : row,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const needsCheck = row.confidence < ROW_CHECK_THRESHOLD;
        const isDuplicate =
          row.name.trim().length > 0 &&
          knownKeys.has(contactNameDedupeKey(row.name));

        return (
          <div
            key={row.id}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-2.5',
              needsCheck ? 'border-dashed border-border' : 'border-border/60',
            )}
          >
            {/* Name + provenance */}
            <div className="flex items-center gap-1.5">
              <Input
                value={row.name}
                onChange={(e) => patchRow(row.id, { name: e.target.value })}
                placeholder="Organisation or person"
                aria-label="Name"
                className={cn(
                  'h-7 flex-1 text-xs font-medium',
                  needsCheck && 'border-dashed',
                )}
                title={
                  needsCheck
                    ? 'Read from context rather than a heading — check the name'
                    : undefined
                }
              />

              {row.inferred && (
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px]"
                  title="Proposed by the model — not read verbatim from the source"
                >
                  NEW
                </Badge>
              )}

              {isDuplicate && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px]"
                  title="A contact with this name is already in the registry — importing merges into it"
                >
                  Already here
                </Badge>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                title="Remove this row"
                onClick={() =>
                  onChange(rows.filter((candidate) => candidate.id !== row.id))
                }
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>

            {/* Role, when the source named one */}
            <Input
              value={row.role}
              onChange={(e) => patchRow(row.id, { role: e.target.value })}
              placeholder="Role (optional)"
              aria-label="Role"
              className="h-7 text-xs"
            />

            {/* Ways of reaching them */}
            <div className="flex flex-col gap-1.5">
              {row.channels.map((channel, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <NativeSelect
                    size="sm"
                    className="w-24 shrink-0"
                    value={channel.kind}
                    aria-label="Channel kind"
                    onChange={(e) =>
                      patchChannel(row.id, index, {
                        kind: e.target.value as ContactChannelKind,
                      })
                    }
                  >
                    {CONTACT_CHANNEL_KINDS.map((kind) => (
                      <NativeSelectOption key={kind} value={kind}>
                        {CHANNEL_LABELS[kind]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>

                  <Input
                    value={channel.value}
                    onChange={(e) =>
                      patchChannel(row.id, index, { value: e.target.value })
                    }
                    placeholder={
                      channel.kind === 'email'
                        ? 'name@example.org'
                        : channel.kind === 'phone'
                          ? '+27 11 000 0000'
                          : 'Address, URL or note'
                    }
                    aria-label="Channel value"
                    className={cn(
                      'h-7 flex-1 text-xs',
                      channel.confidence < CELL_CHECK_THRESHOLD &&
                        'border-dashed',
                    )}
                  />

                  {channel.inferred && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[10px]"
                      title="Proposed by the model — check this value before importing"
                    >
                      NEW
                    </Badge>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                    title="Remove this channel"
                    onClick={() => removeChannel(row.id, index)}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-fit gap-1 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => addChannel(row.id)}
              >
                <PlusIcon className="size-3" />
                Add a way to reach them
              </Button>
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        className="h-7 w-fit gap-1 text-xs"
        onClick={() => onChange([...rows, emptyRow()])}
      >
        <PlusIcon className="size-3" />
        Add a contact the scan missed
      </Button>
    </div>
  );
}
