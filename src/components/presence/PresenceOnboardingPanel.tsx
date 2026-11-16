/**
 * components/presence/PresenceOnboardingPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * First-run questions, inline in the coach pane instead of a modal.
 *
 * The old dialog was a full-screen overlay initialised from `!onboardingComplete`
 * while the profile was still `null`, so it re-opened on the next render after
 * being dismissed. This panel is rendered only from server state, so there is no
 * local "have I shown it" flag to get out of sync. It also leaves the browser
 * pane usable, which is the point of the split layout.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  GOAL_LABELS,
  PLATFORM_LABELS,
  PRESENCE_GOALS,
  PRESENCE_PLATFORMS,
  type PresenceGoal,
  type PresencePlatform,
} from '@/lib/presence';
import { usePresenceActions } from '@/hooks/use-presence';

type Step = 'intro' | 'platforms' | 'goal';

interface PresenceOnboardingPanelProps {
  projectId: string;
  initialPlatforms?: string[];
  initialGoal?: string;
  /** Called after the profile is saved. `generate` starts the first batch. */
  onComplete: (generate: boolean) => void;
}

const PLATFORM_CHOICES = PRESENCE_PLATFORMS.filter(
  (platform) => platform !== 'any',
) as Exclude<PresencePlatform, 'any'>[];

export function PresenceOnboardingPanel({
  projectId,
  initialPlatforms = [],
  initialGoal = '',
  onComplete,
}: PresenceOnboardingPanelProps) {
  const [step, setStep] = useState<Step>('intro');
  const [platforms, setPlatforms] = useState<string[]>(initialPlatforms);
  const [goal, setGoal] = useState(initialGoal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateProfile } = usePresenceActions();

  const togglePlatform = (platform: string) => {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((value) => value !== platform)
        : [...current, platform],
    );
  };

  const save = async (opts: {
    generate: boolean;
    /** Skip setup must not wipe answers a returning user already gave. */
    includeAnswers?: boolean;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        projectId,
        onboardingComplete: true,
        ...(opts.includeAnswers === false ? {} : { platforms, goal }),
      });
      onComplete(opts.generate);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-amber-500/15">
          <SparklesIcon className="size-4 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">
            Your presence coach
          </p>
          <p className="text-[11px] text-muted-foreground">
            Three quick questions, then I&apos;ll suggest the first moves.
          </p>
        </div>
      </div>

      {/* Step rail */}
      <div className="mb-5 flex items-center gap-1.5">
        {(['intro', 'platforms', 'goal'] as Step[]).map((value, index) => (
          <div
            key={value}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              index <= ['intro', 'platforms', 'goal'].indexOf(step)
                ? 'bg-amber-500'
                : 'bg-muted',
            )}
          />
        ))}
      </div>

      {step === 'intro' && (
        <div className="flex flex-1 flex-col">
          <h2 className="text-base font-semibold tracking-tight">
            Build a presence you can keep up with
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            I&apos;ll draft posts, suggest people to connect with, and point out
            groups worth joining. You stay in control: copy what you like, post
            it yourself, and tell me how it went.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Nothing is posted automatically, and your answers stay scoped to
            this project.
          </p>
          <div className="mt-auto flex items-center justify-between pt-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() =>
                void save({ generate: false, includeAnswers: false })
              }
              disabled={saving}
            >
              Skip setup
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-amber-500 text-xs text-white hover:bg-amber-600"
              onClick={() => setStep('platforms')}
            >
              Let&apos;s go
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {step === 'platforms' && (
        <div className="flex flex-1 flex-col">
          <h2 className="text-base font-semibold tracking-tight">
            Where are you present?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Select every platform you post on or want to join.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PLATFORM_CHOICES.map((platform) => {
              const selected = platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {selected && <CheckIcon className="size-3" />}
                  {PLATFORM_LABELS[platform]}
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex items-center justify-between pt-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setStep('intro')}
            >
              <ArrowLeftIcon className="size-3.5" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-amber-500 text-xs text-white hover:bg-amber-600"
              onClick={() => setStep('goal')}
            >
              Next
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="flex flex-1 flex-col">
          <h2 className="text-base font-semibold tracking-tight">
            What are you building toward?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            This shapes the suggestions I write.
          </p>
          <div className="mt-4 flex flex-col gap-1.5">
            {PRESENCE_GOALS.map((value) => {
              const selected = goal === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGoal(value)}
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-colors',
                    selected
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-border/70 hover:border-border',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded-full border',
                      selected
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {selected && <CheckIcon className="size-2.5" />}
                  </span>
                  <span className="font-medium">
                    {GOAL_LABELS[value as PresenceGoal]}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              {error}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between pt-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setStep('platforms')}
            >
              <ArrowLeftIcon className="size-3.5" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-amber-500 text-xs text-white hover:bg-amber-600"
              onClick={() => void save({ generate: true })}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Start my streak'}
              <SparklesIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
