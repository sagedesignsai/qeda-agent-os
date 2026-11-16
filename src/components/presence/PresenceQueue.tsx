/**
 * components/presence/PresenceQueue.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The coach's suggestion queue: newest batch first, older batches collapsed.
 *
 * Batches stay grouped because they are one act of thinking — "here is a set of
 * moves for this week" — and flattening them loses that. The newest batch is the
 * one the user is working, so it starts open; everything else is one click away.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from 'react';
import { ChevronRightIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SuggestionCard } from './SuggestionCard';
import {
  useGreeting,
  usePresenceActions,
  usePresenceBatchDetail,
  usePresenceBatches,
} from '@/hooks/use-presence';
import { cn } from '@/lib/utils';
import type { PresenceBatch } from '@/main/ipc/channels';

interface PresenceQueueProps {
  projectId: string | null;
  onGenerate: () => void;
  generating: boolean;
}

function formatBatchDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function BatchSection({
  batch,
  defaultOpen,
  projectId,
}: {
  batch: PresenceBatch;
  defaultOpen: boolean;
  projectId: string | null;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? defaultOpen;
  const { detail, loading } = usePresenceBatchDetail(batch.id, projectId, isOpen);
  const { deleteBatch } = usePresenceActions();

  const items = detail?.items ?? [];
  const pending = items.filter((item) => item.status === 'pending').length;
  const done = items.filter((item) => item.status === 'done').length;

  const handleDelete = () => {
    if (window.confirm('Delete this batch and all its suggestions?')) {
      void deleteBatch(batch.id, projectId);
    }
  };

  return (
    <section className="group/section rounded-xl border border-border/60 bg-background/40">
      <div className="flex">
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
        >
          <ChevronRightIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-90',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {batch.focus || 'Suggestions'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatBatchDate(batch.created_at)} · {pending} to do · {done} done
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete batch"
          title="Delete batch"
          className="mr-1.5 self-center rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover/section:opacity-100"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      {isOpen && (
        <div className="space-y-1.5 border-t border-border/50 p-1.5">
          {loading && !detail ? (
            <>
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </>
          ) : items.length === 0 ? (
            <p className="px-1.5 py-2 text-[11px] text-muted-foreground">
              This batch is empty.
            </p>
          ) : (
            items.map((item) => (
              <SuggestionCard
                key={item.id}
                item={item}
                projectId={projectId}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

export function PresenceQueue({
  projectId,
  onGenerate,
  generating,
}: PresenceQueueProps) {
  const { batches, loading, error } = usePresenceBatches(projectId);
  const { message } = useGreeting(projectId);
  const [showAll, setShowAll] = useState(false);

  const visibleBatches = useMemo(
    () => (showAll ? batches : batches.slice(0, 4)),
    [batches, showAll],
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Select a project to start building your presence.
        </p>
      </div>
    );
  }

  if (loading && batches.length === 0) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-amber-500/15">
          <SparklesIcon className="size-5 text-amber-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Your first suggestions are one ask away
          </h2>
          <p className="mx-auto mt-1 max-w-[16rem] text-[11px] leading-relaxed text-muted-foreground">
            I&apos;ll draft posts, find people worth connecting with, and point
            out groups where your work fits.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onGenerate}
          disabled={generating}
          className="bg-amber-500 text-xs text-white hover:bg-amber-600"
        >
          <SparklesIcon className="size-3.5" />
          {generating ? 'Thinking…' : 'Generate suggestions'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2.5">
      {message && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          {message}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Suggestion queue
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onGenerate}
          disabled={generating}
          className="h-6 px-1.5 text-[11px] text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          <SparklesIcon className="size-3" />
          New batch
        </Button>
      </div>

      {visibleBatches.map((batch, index) => (
        <BatchSection
          key={batch.id}
          batch={batch}
          defaultOpen={index === 0}
          projectId={projectId}
        />
      ))}

      {batches.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full py-1 text-center text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {showAll
            ? 'Show fewer batches'
            : `Show ${batches.length - 4} older batches`}
        </button>
      )}
    </div>
  );
}
