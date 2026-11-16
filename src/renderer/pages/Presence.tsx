/**
 * renderer/pages/Presence.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Presence workspace: coach on the left, embedded platform tabs on the right.
 *
 * The page itself is mostly composition. It owns three things:
 *   • the project scope and the reads the header needs (counts, streak);
 *   • one "auto prompt" slot, so the header action, onboarding, and the empty
 *     queue can all ask the coach for a batch through the same path;
 *   • the two-pane frame.
 *
 * The coach owns its own conversation. The browser pane owns its own tabs. That
 * separation matters: a chat turn and a tab switch are independent, and neither
 * should remount the other.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { PresenceBrowserPane } from '@/components/presence/PresenceBrowserPane';
import { PresenceOnboardingPanel } from '@/components/presence/PresenceOnboardingPanel';
import {
  PresenceCoachPanel,
  type PresenceAutoPrompt,
} from '@/components/presence/PresenceCoachPanel';
import { StreakBadge } from '@/components/presence/StreakBadge';
import { useProjectScope } from '@/hooks/use-project-scope';
import { usePresenceCounts, usePresenceProfile } from '@/hooks/use-presence';
import { PRESENCE_GENERATION_PROMPT } from '@/lib/presence';

export default function Presence() {
  const { projectId } = useProjectScope();
  const {
    profile,
    platforms,
    loading: profileLoading,
  } = usePresenceProfile(projectId);
  const { counts } = usePresenceCounts(projectId);

  const [autoPrompt, setAutoPrompt] = useState<PresenceAutoPrompt | null>(null);
  const [editMode, setEditMode] = useState(false);
  const promptSequence = useRef(0);

  const seedGeneration = useCallback(() => {
    promptSequence.current += 1;
    setAutoPrompt({
      id: promptSequence.current,
      text: PRESENCE_GENERATION_PROMPT,
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        crumbs={[{ label: 'Presence' }]}
        subtitle="Your social presence coach"
        meta={
          <div className="flex items-center gap-2">
            <StreakBadge projectId={projectId} />
            <span className="hidden text-[11px] text-muted-foreground lg:inline">
              {counts.pending} to do · {counts.done} done
            </span>
          </div>
        }
        actions={
          <Button
            type="button"
            size="sm"
            onClick={seedGeneration}
            disabled={!projectId}
            className="h-7 bg-amber-500 px-2.5 text-[11px] text-white hover:bg-amber-600"
          >
            <PlusIcon className="size-3.5" />
            New suggestions
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[21rem] shrink-0 flex-col border-r border-border/60 bg-card/10 lg:w-[23rem]">
          {/*
            Keyed by project: the coach conversation and the open platform tabs
            are both project-scoped. Remounting on a project switch drops the old
            transcript and closes the old native tabs instead of letting them
            bleed across scopes.
          */}
          {editMode && projectId ? (
            <PresenceOnboardingPanel
              key={`edit:${projectId}`}
              projectId={projectId}
              initialPlatforms={platforms}
              initialGoal={profile?.goal ?? ''}
              editMode
              onComplete={() => setEditMode(false)}
              onCancel={() => setEditMode(false)}
            />
          ) : (
            <PresenceCoachPanel
              key={`coach:${projectId ?? 'none'}`}
              projectId={projectId}
              profile={profile}
              profileLoading={profileLoading}
              counts={counts}
              platforms={platforms}
              autoPrompt={autoPrompt}
              onAutoPromptConsumed={() => setAutoPrompt(null)}
              onGenerate={seedGeneration}
              onEditProfile={() => setEditMode(true)}
            />
          )}
        </aside>

        <section className="min-w-0 flex-1">
          <PresenceBrowserPane
            key={`browser:${projectId ?? 'none'}`}
            projectId={projectId}
            platforms={platforms}
          />
        </section>
      </div>
    </div>
  );
}
