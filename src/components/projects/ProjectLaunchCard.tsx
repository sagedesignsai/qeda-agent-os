/**
 * components/projects/ProjectLaunchCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The project page's first push: one task, its first move, one button.
 *
 * The page used to open with progress, trend and counts — all retrospective.
 * A project that has been planned but never started therefore read as "twelve
 * tasks and a bar", which is the moment motivation dies. This card sits above
 * the rollup for exactly as long as there is something worth starting, and
 * starts it in place via `igniteTask` — same clock, same XP, same rail as the
 * invitation in the sidebar. Statistics move below it; the next move leads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router';
import { ArrowRightIcon, ListTodoIcon, ZapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useIgnitionCandidate } from '@/hooks/use-ignition-candidate';
import { igniteTask } from '@/lib/focus/ignite';
import { IGNITION_PRESET_MINUTES } from '@/lib/focus/presets';
import { celebrationAudio } from '@/lib/celebration-audio';
import { triggerParticleBurst } from '@/components/gamification/ParticleCanvas';

export interface ProjectLaunchCardProps {
  projectId: string;
}

export function ProjectLaunchCard({ projectId }: ProjectLaunchCardProps) {
  const focus = useFocusSession();
  // A running session owns the rail and the attention; a second Start button
  // on the same page would compete with it.
  const { candidate, firstMove } = useIgnitionCandidate(projectId, {
    enabled: !focus.focusedTask,
  });

  const task = candidate?.task ?? null;
  if (!task) return null;

  const start = async (event: React.MouseEvent) => {
    triggerParticleBurst(event.clientX, event.clientY);
    const result = await igniteTask(task, { source: 'project_launch' });
    celebrationAudio.playCompletionChime();
    toast.success(
      result.xp > 0
        ? `Flow started · +${result.xp} XP`
        : 'Flow started',
      {
        description: `${IGNITION_PRESET_MINUTES} minutes and running, in the rail.`,
      },
    );
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-amber-500/35',
        'bg-gradient-to-br from-amber-500/[0.10] via-card/60 to-card/30 p-4',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-amber-500 uppercase">
            <ZapIcon className="size-3.5 fill-amber-500" />
            Start here
          </p>

          <p className="mt-1.5 text-sm leading-snug font-semibold text-foreground">
            {firstMove ?? task.title}
          </p>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {candidate?.rationale}
          </p>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
            <span className="max-w-[28rem] truncate" title={task.title}>
              {task.title}
            </span>
            {task.estimate_mins ? (
              <>
                <span aria-hidden>·</span>
                <span>{task.estimate_mins} min estimate</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={(event) => void start(event)}
            className="h-8 gap-1.5 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
          >
            <ArrowRightIcon className="size-3.5 stroke-[2.5]" />
            Start {IGNITION_PRESET_MINUTES} min flow
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <Link to={`/tasks?project=${encodeURIComponent(projectId)}`}>
              <ListTodoIcon className="size-3.5" />
              All tasks
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
