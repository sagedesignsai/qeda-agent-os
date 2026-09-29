/**
 * components/tasks/TodayEmptyHero.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Daily Kickoff & Command Center for the Today surface.
 *
 * Greets the user with time-of-day awareness, an inviting conversational
 * composer (like ChatWelcome) for asking Copilot to shape or dump thoughts,
 * 1-click suggestion chips, and the #1 Spotlight "Next Best Move" quick start.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BrainIcon,
  ClockIcon,
  FlameIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  SunIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { cn } from '@/lib/utils';
import { XP_REWARDS } from '@/lib/gamification';
import type { TaskRecommendation } from '@/lib/task-recommendations';
import type { Task } from '@/main/ipc/channels';

export interface TodayEmptyHeroProps {
  recommendation: TaskRecommendation;
  openTasksCount: number;
  streakDays: number;
  onStartFlow: (task: Task, event: React.MouseEvent) => void;
  onOpenKickoff: () => void;
  onAutoPlan: () => void;
  onSendPrompt?: (prompt: string) => void;
  onOpenSteps?: (task: Task) => void;
  onShuffle?: () => void;
  onOpenBrainDump?: () => void;
  planning?: boolean;
}

interface Suggestion {
  label: string;
  prompt: string;
  icon: LucideIcon;
  action?: 'brain-dump';
}

const SUGGESTIONS: Suggestion[] = [
  {
    label: "Plan today's top 3",
    icon: SunIcon,
    prompt:
      'Look at my backlog and plan my top 3 priorities for today with realistic time estimates.',
  },
  {
    label: 'Brain dump thoughts',
    icon: BrainIcon,
    prompt:
      'Help me brain dump and organize all the scattered thoughts in my head into clean tasks.',
    action: 'brain-dump',
  },
  {
    label: 'Find 3 quick wins',
    icon: ZapIcon,
    prompt:
      'Find 3 quick-win tasks in my backlog that take 15 minutes or less so I can build instant momentum.',
  },
  {
    label: 'Break down a goal',
    icon: SparklesIcon,
    prompt:
      'I have a large milestone I want to tackle. Guide me through breaking it down into 2-minute starter steps.',
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function TodayEmptyHero({
  recommendation,
  openTasksCount,
  streakDays,
  onStartFlow,
  onOpenKickoff,
  onAutoPlan,
  onSendPrompt,
  onOpenSteps,
  onShuffle,
  onOpenBrainDump,
  planning = false,
}: TodayEmptyHeroProps) {
  const { task, rationale } = recommendation;
  const [promptText, setPromptText] = useState('');
  const [shuffling, setShuffling] = useState(false);

  const xpReward =
    task?.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task?.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  const handlePromptSubmit = () => {
    const text = promptText.trim();
    if (!text) return;
    onSendPrompt?.(text);
    setPromptText('');
  };

  const handleSuggestionClick = (item: Suggestion) => {
    if (item.action === 'brain-dump' && onOpenBrainDump) {
      onOpenBrainDump();
    } else {
      onSendPrompt?.(item.prompt);
    }
  };

  const handleShuffleClick = () => {
    if (!onShuffle) return;
    setShuffling(true);
    onShuffle();
    setTimeout(() => setShuffling(false), 200);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto my-auto flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border border-border/80 bg-gradient-to-b from-card via-card/90 to-background/50 p-7 text-center shadow-lg"
    >
      {/* Sun/Kickoff icon */}
      <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 shadow-sm">
        <SunIcon className="size-6" />
      </div>

      {/* Greeting & State Summary */}
      <div className="space-y-1.5">
        <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {getGreeting()}! Ready to kick off today's flow?
        </h3>
        <p className="text-xs text-muted-foreground">
          {openTasksCount > 0 ? (
            <>
              You have{' '}
              <strong className="text-foreground">
                {openTasksCount} tasks
              </strong>{' '}
              waiting.
              {streakDays > 0 ? (
                <span className="ml-1">
                  Complete 1 task to protect your{' '}
                  <strong className="text-amber-400">
                    {streakDays}d streak
                  </strong>
                  .
                </span>
              ) : (
                <span className="ml-1">
                  Start with a quick win to build momentum.
                </span>
              )}
            </>
          ) : (
            'Your backlog is all caught up. Drop raw thoughts or ask Copilot to shape a plan.'
          )}
        </p>
      </div>

      {/* Centerpiece: Conversational Prompt Composer (ChatWelcome style) */}
      <div className="w-full">
        <PromptInput
          onSubmit={handlePromptSubmit}
          className="rounded-xl border border-border/80 bg-background/80 shadow-inner focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/20 transition-all"
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask Copilot: plan my day, break down a goal, or brain dump thoughts…"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="min-h-[58px] resize-none text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60"
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-between px-3 py-2 border-t border-border/40">
            <PromptInputTools>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                <SparklesIcon className="size-3.5 text-amber-500" />
                Focus Copilot
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!promptText.trim()}
              className="size-7 bg-amber-500 text-zinc-950 hover:bg-amber-400"
            />
          </PromptInputFooter>
        </PromptInput>
      </div>

      {/* Suggestion Chips */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSuggestionClick(item)}
              className="h-7 gap-1.5 rounded-full border-border/70 bg-card/60 px-3 text-xs text-muted-foreground hover:border-amber-500/40 hover:bg-card hover:text-foreground transition-all active:scale-95"
            >
              <Icon className="size-3 text-amber-500" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {/* Spotlight Recommended Task or Divider */}
      {task && (
        <div className="w-full space-y-3 pt-1">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/40" />
            </div>
            <span className="relative bg-card px-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              or jump straight into flow
            </span>
          </div>

          <div className="flex w-full flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left transition-colors hover:border-amber-500/50">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                <ZapIcon className="size-3.5 fill-amber-500" />
                Recommended Quick Start
              </span>
              <Badge
                variant="secondary"
                className="border-0 bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-400"
              >
                +{xpReward} XP
              </Badge>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
              >
                <h4 className="text-sm font-semibold text-card-foreground">
                  {task.title}
                </h4>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-400/90">
                  <FlameIcon className="size-3 shrink-0" />
                  <span>{rationale}</span>
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-rose-400">
                  P{task.priority} Priority
                </span>
                {task.estimate_mins && (
                  <span className="flex items-center gap-0.5">
                    <ClockIcon className="size-2.5" />
                    {task.estimate_mins}m
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {onShuffle && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={handleShuffleClick}
                  >
                    <RefreshCwIcon
                      className={cn('size-3', shuffling && 'animate-spin')}
                    />
                    Suggest another
                  </Button>
                )}

                {onOpenSteps && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenSteps(task)}
                  >
                    <SparklesIcon className="size-3 text-sky-400" />
                    Break down
                  </Button>
                )}

                <Button
                  size="sm"
                  className="h-7 gap-1.5 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 active:scale-95"
                  onClick={(e) => onStartFlow(task, e)}
                >
                  <ZapIcon className="size-3 fill-current" />
                  Quick Start
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guided Planning Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-amber-500/30 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
          onClick={onOpenKickoff}
          disabled={openTasksCount === 0}
        >
          <SunIcon className="size-3.5 fill-amber-500/20" />
          60s Morning Kickoff (+40 XP)
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onAutoPlan}
          disabled={planning || openTasksCount === 0}
        >
          {planning ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <SparklesIcon className="size-3 text-amber-500" />
          )}
          Auto-Plan Day with AI
        </Button>
      </div>
    </motion.div>
  );
}
