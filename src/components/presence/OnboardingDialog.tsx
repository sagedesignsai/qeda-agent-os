/**
 * components/presence/OnboardingDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-step onboarding modal: intro → platforms → goals → auto-generate.
 * Stores answers in presence_profile. Shown only when onboarding_complete is false.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { XIcon, CheckIcon } from 'lucide-react';
import { usePresenceActions } from '@/hooks/use-presence';
import { PRESENCE_PLATFORMS, PLATFORM_LABELS, PRESENCE_GOALS, GOAL_LABELS } from '@/lib/presence';

interface OnboardingDialogProps {
  projectId: string;
  onClose: () => void;
  onGenerate: () => void;
}

type Step = 'intro' | 'platforms' | 'goals';

export function OnboardingDialog({ projectId, onClose, onGenerate }: OnboardingDialogProps) {
  const [step, setStep] = useState<Step>('intro');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [goal, setGoal] = useState<string>('');
  const { updateProfile } = usePresenceActions();

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const handleFinish = async () => {
    await updateProfile({
      projectId,
      onboardingComplete: true,
      platforms,
      goal,
    });
    onGenerate();
    onClose();
  };

  const handleSkip = async () => {
    await updateProfile({
      projectId,
      onboardingComplete: true,
    });
    onGenerate();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-900">
        {step === 'intro' && (
          <>
            <h2 className="text-xl font-semibold">Hi! I'm your Presence coach.</h2>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              I'll help you build your social presence, one step at a time. I'll suggest posts to
              make, people to connect with, and platforms to join.
            </p>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              You take it from there — I'll open the platform for you, and we'll learn together
              what works.
            </p>
            <p className="mt-4 font-medium text-zinc-700 dark:text-zinc-300">
              Let's start with a few questions...
            </p>
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={handleSkip}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => setStep('platforms')}
                className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Let's go
                <CheckIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {step === 'platforms' && (
          <>
            <h2 className="text-xl font-semibold">Which platforms are you on?</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Or want to join — select all that apply.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {PRESENCE_PLATFORMS.filter((p) => p !== 'any').map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    platforms.includes(p)
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  {platforms.includes(p) && <CheckIcon className="h-3 w-3" />}
                  {PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS]}
                </button>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('intro')}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('goals')}
                className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Next
                <CheckIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {step === 'goals' && (
          <>
            <h2 className="text-xl font-semibold">What's your main goal?</h2>
            <div className="mt-6 flex flex-col gap-2">
              {PRESENCE_GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGoal(g)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    goal === g
                      ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      goal === g
                        ? 'border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {goal === g && <CheckIcon className="h-3 w-3 text-white dark:text-zinc-900" />}
                  </div>
                  <span className="text-sm font-medium">
                    {GOAL_LABELS[g as keyof typeof GOAL_LABELS]}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('platforms')}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Start my journey
                <CheckIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
