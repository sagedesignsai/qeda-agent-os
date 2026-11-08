/**
 * renderer/pages/Presence.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Presence coach page — warm greeting, onboarding, batches with
 * conversational suggestion cards, and an empty state that invites action.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useProjectScope } from '@/hooks/use-project-scope';
import {
  usePresenceBatches,
  usePresenceBatchDetail,
  usePresenceCounts,
  usePresenceProfile,
  usePresenceActions,
} from '@/hooks/use-presence';
import { CoachGreeting } from '@/components/presence/CoachGreeting';
import { OnboardingDialog } from '@/components/presence/OnboardingDialog';
import { SuggestionCard } from '@/components/presence/SuggestionCard';
import { StreakBadge } from '@/components/presence/StreakBadge';
import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from 'lucide-react';
import type { PresenceBatch } from '@/main/ipc/channels';

function BatchList({
  batches,
  expandedBatches,
  onToggleBatch,
}: {
  batches: PresenceBatch[];
  expandedBatches: Set<string>;
  onToggleBatch: (id: string) => void;
}) {
  return (
    <div className="space-y-4 pt-4">
      {batches.map((batch) => (
        <BatchItem
          key={batch.id}
          batch={batch}
          isExpanded={expandedBatches.has(batch.id)}
          onToggle={() => onToggleBatch(batch.id)}
        />
      ))}
    </div>
  );
}

function BatchItem({
  batch,
  isExpanded,
  onToggle,
}: {
  batch: PresenceBatch;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { detail } = usePresenceBatchDetail(batch.id);
  const items = detail?.items ?? [];
  const doneCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-zinc-400" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {detail?.batch.focus || 'Suggestions'}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {items.length} suggestions · {doneCount} done
          </p>
        </div>
      </button>
      {isExpanded && (
        <div className="space-y-3 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading suggestions...</p>
          ) : (
            items.map((item) => <SuggestionCard key={item.id} item={item} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function Presence() {
  const { projectId } = useProjectScope();
  const { onboardingComplete } = usePresenceProfile(projectId);
  const { batches } = usePresenceBatches(projectId);
  const { counts } = usePresenceCounts(projectId);
  const { generate } = usePresenceActions();

  const [showOnboarding, setShowOnboarding] = useState(!onboardingComplete);
  const [generating, setGenerating] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    if (!projectId) return;
    setGenerating(true);
    try {
      const detail = await generate(projectId);
      setExpandedBatches((prev) => new Set(prev).add(detail.batch.id));
    } catch {
      // Error handled by AI layer
    } finally {
      setGenerating(false);
    }
  };

  const toggleBatch = (id: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Show onboarding dialog on first run
  if (showOnboarding && projectId) {
    return (
      <OnboardingDialog
        projectId={projectId}
        onClose={() => setShowOnboarding(false)}
        onGenerate={handleGenerate}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Presence</h1>
            <StreakBadge projectId={projectId} />
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {counts.pending} pending · {counts.done} done · {counts.skipped} skipped
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !projectId}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <SparklesIcon className="h-4 w-4" />
          {generating ? 'Generating...' : 'Generate suggestions'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!projectId ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a project to start building your presence.
            </p>
          </div>
        ) : batches.length === 0 ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-orange-50 to-amber-50 p-8 dark:border-zinc-700 dark:from-orange-950/30 dark:to-amber-950/30">
              <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300">
                Your social presence journey starts here
              </h2>
              <p className="mt-3 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                I'll help you build your online presence, one step at a time. Let me suggest some
                posts to make, people to connect with, and platforms to join.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <SparklesIcon className="h-4 w-4" />
                {generating ? 'Generating...' : 'Generate suggestions'}
              </button>
            </div>
          </div>
        ) : (
          /* Batches list */
          <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
            {/* Greeting section */}
            <CoachGreeting
              projectId={projectId}
              onGenerate={handleGenerate}
              generating={generating}
            />

            {/* Batches */}
            <BatchList
              batches={batches}
              expandedBatches={expandedBatches}
              onToggleBatch={toggleBatch}
            />
          </div>
        )}
      </div>
    </div>
  );
}
