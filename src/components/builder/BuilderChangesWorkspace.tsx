/**
 * components/builder/BuilderChangesWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Review-first change surface for additions, edits, and removals. It accepts a
 * service-neutral change list and keeps destructive/keep actions visibly gated
 * until real workspace operations are connected.
 *
 * THE REVIEW PROMISE LIVES IN THE CONVERSATION, NOT HERE
 * ─────────────────────────────────────────────────────
 * This surface used to state the safety promise three times on its own — "A safe
 * place to review", "Each proposed edit will be visible here before it becomes
 * part of your project", and a "Nothing applied automatically" pill — while the
 * canvas footer said a fourth version and the conversation a fifth. The promise
 * is stated once, under the composer, and this surface earns trust through the
 * thing that actually makes it true: the diff on the right and the Keep/Discard
 * decision on the left. The empty state now only says what is *absent*, not what
 * is guaranteed.
 *
 * TYPE
 * ────
 * `text-xs` (11px) for the list, counts, and diff; `text-sm` (12px) for prose.
 * The 8px tier that used to carry file names, parent paths, and count pills is
 * gone.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from 'react';
import {
  CheckIcon,
  ChevronRightIcon,
  FileCode2Icon,
  GitCompareArrowsIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type {
  BuilderChangeKind,
  BuilderFileChange,
} from '@/lib/builder-workspace';

type ChangeFilter = 'all' | BuilderChangeKind;

interface BuilderChangesWorkspaceProps {
  changes?: BuilderFileChange[];
  onKeepAll?: () => void;
  onDiscardAll?: () => void;
}

export function BuilderChangesWorkspace({
  changes = [],
  onKeepAll,
  onDiscardAll,
}: BuilderChangesWorkspaceProps) {
  const [filter, setFilter] = useState<ChangeFilter>('all');
  const [selectedPath, setSelectedPath] = useState('');
  const visibleChanges = useMemo(
    () =>
      filter === 'all'
        ? changes
        : changes.filter((change) => change.kind === filter),
    [changes, filter],
  );
  const selectedChange =
    visibleChanges.find((change) => change.path === selectedPath) ??
    visibleChanges[0];
  const totals = changes.reduce(
    (result, change) => {
      result[change.kind] += 1;
      result.additions += change.additions;
      result.deletions += change.deletions;
      return result;
    },
    { added: 0, modified: 0, deleted: 0, additions: 0, deletions: 0 },
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-1">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as ChangeFilter)}
        >
          <TabsList variant="line" className="h-8 gap-1 p-0">
            <FilterTab value="all" label="All" count={changes.length} />
            <FilterTab value="added" label="Added" count={totals.added} />
            <FilterTab
              value="modified"
              label="Modified"
              count={totals.modified}
            />
            <FilterTab value="deleted" label="Deleted" count={totals.deleted} />
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            disabled={changes.length === 0 || !onDiscardAll}
            onClick={onDiscardAll}
            title={
              onDiscardAll
                ? 'Reset the worktree to HEAD — all agent changes are discarded.'
                : 'Discard is available after a workspace is bound.'
            }
          >
            <RotateCcwIcon className="size-3" />
            Discard
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={changes.length === 0 || !onKeepAll}
            onClick={onKeepAll}
            title={
              onKeepAll
                ? 'Apply the worktree changes to your source tree.'
                : 'Keep is available after a workspace is bound.'
            }
          >
            <CheckIcon className="size-3" />
            Keep changes
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[min(37%,280px)] min-w-[168px] shrink-0 flex-col border-r border-border/60 bg-card/20">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/40 px-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <span>Changed files</span>
            <span className="tabular-nums">{changes.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {visibleChanges.length > 0 ? (
              <div className="space-y-0.5">
                {visibleChanges.map((change) => (
                  <ChangeFileRow
                    key={change.path}
                    change={change}
                    selected={selectedChange?.path === change.path}
                    onSelect={() => setSelectedPath(change.path)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center px-3 py-8 text-center">
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg border border-border/50 bg-background/70 text-muted-foreground">
                  <GitCompareArrowsIcon className="size-3.5" />
                </div>
                <p className="text-sm font-medium">
                  {changes.length === 0
                    ? 'No changes yet'
                    : 'Nothing in this filter'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {changes.length === 0
                    ? 'Edits from your build will be collected here for review.'
                    : 'Choose another change type to see its files.'}
                </p>
              </div>
            )}
          </div>
          <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border/50 px-2.5 text-xs text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{totals.additions}
            </span>
            <span className="text-destructive">−{totals.deletions}</span>
            <span className="ml-auto">lines</span>
          </div>
        </aside>

        <section
          className="flex min-w-0 flex-1 flex-col"
          aria-label="Change diff"
        >
          {selectedChange ? (
            <>
              <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">
                    {selectedChange.path}
                  </span>
                  <ChangeKindBadge kind={selectedChange.kind} />
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{selectedChange.additions}
                  </span>
                  <span className="mx-1 text-muted-foreground/50">/</span>
                  <span className="text-destructive">
                    −{selectedChange.deletions}
                  </span>
                </span>
              </div>
              {selectedChange.diff ? (
                <DiffView diff={selectedChange.diff} />
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center">
                  <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                    The diff for this file will appear here when the workspace
                    change data is available.
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Only says what is absent. The guarantee that nothing lands without
               a decision is stated once, under the composer. */
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-10 text-center">
              <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(var(--border)_0.65px,transparent_0.65px)] [background-size:15px_15px]" />
              <div className="relative flex max-w-xs flex-col items-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground shadow-sm">
                  <FileCode2Icon className="size-4" />
                </div>
                <h3 className="text-sm font-medium">Nothing to review yet</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {changes.length === 0
                    ? 'Choose a filter above, or run a build — the files it changes show up here with their diffs.'
                    : 'Choose another change type to see its diff.'}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterTab({
  value,
  label,
  count,
}: {
  value: ChangeFilter;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger value={value} className="h-7 flex-none gap-1 px-1.5 text-xs">
      {label}
      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-xs leading-none tabular-nums text-muted-foreground">
        {count}
      </span>
    </TabsTrigger>
  );
}

function ChangeFileRow({
  change,
  selected,
  onSelect,
}: {
  change: BuilderFileChange;
  selected: boolean;
  onSelect: () => void;
}) {
  const name = change.path.split('/').pop() ?? change.path;
  const parent = change.path.split('/').slice(0, -1).join('/');
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50',
        selected && 'bg-accent/60',
      )}
      aria-current={selected ? 'true' : undefined}
    >
      <ChangeKindBadge kind={change.kind} compact />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {parent || 'root'}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums">
        <span className="text-emerald-600 dark:text-emerald-400">
          +{change.additions}
        </span>
        <span className="text-destructive">−{change.deletions}</span>
      </span>
      <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function ChangeKindBadge({
  kind,
  compact = false,
}: {
  kind: BuilderChangeKind;
  compact?: boolean;
}) {
  const label = kind === 'added' ? 'A' : kind === 'deleted' ? 'D' : 'M';
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 rounded px-1 text-xs uppercase leading-none',
        compact && 'flex size-4 items-center justify-center p-0',
        kind === 'added' &&
          'border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
        kind === 'modified' &&
          'border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-400',
        kind === 'deleted' &&
          'border-destructive/25 bg-destructive/5 text-destructive',
      )}
    >
      {compact ? label : kind}
    </Badge>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background py-3 font-mono text-xs leading-5">
      <pre className="min-w-max">
        {diff.split('\n').map((line, index) => {
          const isAdded = line.startsWith('+') && !line.startsWith('+++');
          const isRemoved = line.startsWith('-') && !line.startsWith('---');
          const isHunk = line.startsWith('@@');
          return (
            <span
              key={`diff-line-${index}`}
              className={cn(
                'block min-h-5 whitespace-pre px-3',
                isAdded &&
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                isRemoved && 'bg-destructive/10 text-destructive',
                isHunk && 'bg-sky-500/5 text-sky-700 dark:text-sky-300',
                !isAdded && !isRemoved && !isHunk && 'text-foreground/75',
              )}
            >
              {line || ' '}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
