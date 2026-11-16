/**
 * components/presence/PresenceActivityView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The first internal Presence tab: streak and activity.
 *
 * It only shows facts the database actually holds — current streak, last active
 * day, item counts, and logged posts. There is deliberately no invented
 * contribution calendar: a fake grid of "active days" would be a lie the rest of
 * the app cannot back up.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FlameIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePresenceCounts,
  usePresencePosts,
  usePresenceStreak,
} from '@/hooks/use-presence';
import {
  MILESTONE_MESSAGES,
  PLATFORM_LABELS,
  type PresencePlatform,
} from '@/lib/presence';
import { cn } from '@/lib/utils';

const MILESTONES = Object.keys(MILESTONE_MESSAGES)
  .map(Number)
  .sort((a, b) => a - b);

function nextMilestone(streak: number): number {
  return (
    MILESTONES.find((value) => value > streak) ??
    MILESTONES[MILESTONES.length - 1]
  );
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
      <p className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function PresenceActivityView({
  projectId,
}: {
  projectId: string | null;
}) {
  const {
    streakCount,
    lastActiveDate,
    loading: streakLoading,
  } = usePresenceStreak(projectId);
  const { counts } = usePresenceCounts(projectId);
  const { posts, loading: postsLoading } = usePresencePosts(projectId);

  const target = nextMilestone(streakCount);
  const progress = Math.min(100, Math.round((streakCount / target) * 100));

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Streak &amp; activity
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            A day counts when you mark a suggestion done or save an edit.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
          {streakLoading ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/15">
                  <FlameIcon className="size-5 text-amber-500" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">
                    {streakCount}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    day{streakCount === 1 ? '' : 's'} in a row
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-amber-500/15">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {streakCount === 0
                      ? 'Mark one suggestion done to start'
                      : `${target - streakCount} to the ${target}-day milestone`}
                  </span>
                  <span>
                    {lastActiveDate
                      ? `Last active ${lastActiveDate}`
                      : 'No activity yet'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="To do" value={counts.pending} />
          <Stat
            label="Done"
            value={counts.done}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <Stat label="Skipped" value={counts.skipped} />
          <Stat
            label="Posts logged"
            value={posts.length}
            tone="text-amber-600 dark:text-amber-400"
          />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Logged posts
            </h3>
            <Badge
              variant="secondary"
              className="h-4 px-1.5 text-[9px] font-normal"
            >
              {posts.length}
            </Badge>
          </div>

          {postsLoading && posts.length === 0 ? (
            <Skeleton className="h-14 rounded-lg" />
          ) : posts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 p-3 text-[11px] text-muted-foreground">
              Nothing logged yet. When you publish something, ask the coach to
              log it — that is what separates “I meant to post” from “I posted”.
            </p>
          ) : (
            <div className="space-y-1.5">
              {posts.slice(0, 8).map((post) => (
                <article
                  key={post.id}
                  className="rounded-lg border border-border/60 bg-card/40 p-2.5"
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {PLATFORM_LABELS[post.platform as PresencePlatform] ??
                        post.platform}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{formatDate(post.posted_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {post.content}
                  </p>
                  {post.metrics && (
                    <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                      {post.metrics}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
