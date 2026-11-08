/**
 * components/presence/CoachGreeting.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Personalized greeting section with streak display, "Today's focus" cards
 * (1–3 pending items), and a "Generate more" button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SparklesIcon } from 'lucide-react';
import { useGreeting } from '@/hooks/use-presence';
import { usePresenceBatches, usePresenceBatchDetail, usePresenceActions } from '@/hooks/use-presence';
import { StreakBadge } from './StreakBadge';
import type { PresenceItem } from '@/main/ipc/channels';
import { KIND_LABELS, PLATFORM_LABELS } from '@/lib/presence';

interface CoachGreetingProps {
  projectId: string | null;
  onGenerate: () => void;
  generating: boolean;
}

export function CoachGreeting({ projectId, onGenerate, generating }: CoachGreetingProps) {
  const { message } = useGreeting(projectId);
  const { batches } = usePresenceBatches(projectId);
  const { generate } = usePresenceActions();

  // Get today's focus: 1–3 pending items from the latest batch
  const latestBatch = batches[0];
  const { detail: latestDetail } = usePresenceBatchDetail(latestBatch?.id ?? null);
  const focusItems: PresenceItem[] = (latestDetail?.items ?? [])
    .filter((item) => item.status === 'pending')
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Header with streak */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Presence</h1>
        <StreakBadge projectId={projectId} />
      </div>

      {/* Greeting */}
      {message && (
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-orange-50 to-amber-50 p-6 dark:border-zinc-700 dark:from-orange-950/30 dark:to-amber-950/30">
          <p className="text-lg text-zinc-700 dark:text-zinc-300">{message}</p>
        </div>
      )}

      {/* Today's focus */}
      {focusItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Here's what to focus on today:
          </h2>
          {focusItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="mt-0.5 flex-shrink-0">
                <SparklesIcon className="h-4 w-4 text-orange-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    {KIND_LABELS[item.kind as keyof typeof KIND_LABELS] ?? item.kind}
                  </span>
                  {item.platform !== 'any' && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      · {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {item.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate button */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <SparklesIcon className="h-4 w-4" />
          {generating ? 'Generating...' : 'Generate more suggestions'}
        </button>
      </div>
    </div>
  );
}
