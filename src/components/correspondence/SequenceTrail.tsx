/**
 * components/correspondence/SequenceTrail.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A plan attached to a sent item: its steps, where it has got to, and the one
 * decision it is waiting on.
 *
 * WHY IT LIVES INSIDE THE EXPANDED MESSAGE
 * A plan is not a separate thing in this system — it is the follow-through of one
 * item that went out. Putting it anywhere else would force the user to hold the
 * correspondence and the plan in their head at once, which is exactly the work the
 * system is supposed to remove.
 *
 * THE STALLED CASE IS THE POINT OF THE COMPONENT
 * When a step came due while Qeda was closed, the trail says so in those words, shows
 * how late it is, and offers an explicit "Do it anyway" — which is the only way that
 * step can ever fire. There is no silent catch-up, because a plan that quietly fires a
 * 14-day legal step on the user's behalf is worse than a plan that stops and asks.
 *
 * Fire-and-forget plans are offered as a template ("Demand → escalation") with
 * editable timeframes, not as a jurisdiction rulebook: the plan defers statutory
 * content (D1), so nothing here claims to know the law of any place.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleDashedIcon,
  ClockIcon,
  Loader2Icon,
  PlayIcon,
  SquareIcon,
  WorkflowIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEMAND_THEN_ESCALATE, type StepOutlook } from '@/lib/sequence';
import {
  useMessageRuns,
  useSequenceActions,
  useSequences,
} from '@/hooks/use-correspondence';

const OUTLOOK_STYLE: Record<
  StepOutlook,
  { icon: typeof CheckIcon; className: string }
> = {
  done: { icon: CheckIcon, className: 'text-muted-foreground' },
  waiting: { icon: ClockIcon, className: 'text-muted-foreground' },
  stalled: { icon: AlertTriangleIcon, className: 'text-destructive' },
  due: { icon: PlayIcon, className: 'text-primary' },
  upcoming: { icon: CircleDashedIcon, className: 'text-muted-foreground/50' },
};

export interface SequenceTrailProps {
  messageId: string;
  projectId: string | null;
  /** Plans only make sense once something has actually gone out. */
  messageSent: boolean;
}

export function SequenceTrail({
  messageId,
  projectId,
  messageSent,
}: SequenceTrailProps) {
  const { runs, loading } = useMessageRuns(messageId);
  const { sequences } = useSequences(projectId);
  const actions = useSequenceActions();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const attach = async () => {
    setBusy(true);
    setNote(null);
    try {
      // Reuse the template plan if this scope already has one, so attaching twice
      // does not litter the project with identical plans.
      const existing = sequences.find(
        (sequence) => sequence.name === 'Demand → escalation',
      );
      const plan =
        existing ??
        (await actions.create({
          projectId,
          name: 'Demand → escalation',
          description:
            'Wait for a reply, chase whoever stayed quiet, then decide what is next.',
          steps: DEMAND_THEN_ESCALATE.map((step) => ({
            kind: step.kind,
            title: step.title,
            config: step.config as Record<string, unknown>,
          })),
        }));

      await actions.start(plan.id, messageId, projectId);
    } finally {
      setBusy(false);
    }
  };

  if (loading && runs.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">Loading plan…</p>
    );
  }

  if (!messageSent) return null;

  if (runs.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2.5 py-2">
        <WorkflowIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">
          No plan attached — nothing will chase this for you.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-[11px]"
          disabled={busy}
          onClick={() => void attach()}
        >
          {busy && <Loader2Icon className="size-3 animate-spin" />}
          Attach demand → escalation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map(({ run, analysis }) => (
        <div
          key={run.id}
          className={cn(
            'flex flex-col gap-1.5 rounded-md border px-2.5 py-2',
            analysis.stalled.length > 0
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-border/60',
          )}
        >
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {analysis.stalled.length > 0
                ? 'Plan waiting on you'
                : run.status === 'running'
                  ? 'Plan running'
                  : `Plan ${run.status}`}
              {analysis.waitingUntil ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  waiting until{' '}
                  {new Date(analysis.waitingUntil * 1000).toLocaleDateString()}
                </span>
              ) : null}
            </span>

            {run.status === 'running' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                title="Stop this plan. Nothing is undone; it just stops advancing."
                onClick={() => void actions.stop(run.id)}
              >
                <SquareIcon className="size-3" />
                Stop
              </Button>
            )}
          </div>

          <ol className="flex flex-col gap-0.5">
            {analysis.steps.map((view) => {
              const style = OUTLOOK_STYLE[view.outlook];
              const Icon = style.icon;
              return (
                <li
                  key={view.step.id}
                  className="flex items-start gap-2 text-[11px]"
                >
                  <Icon className={cn('mt-0.5 size-3 shrink-0', style.className)} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate',
                        view.outlook === 'upcoming' && 'text-muted-foreground/70',
                        view.outlook === 'stalled' && 'font-medium',
                      )}
                    >
                      {view.step.title}
                    </span>
                    <span className="block text-muted-foreground">
                      {view.detail}
                    </span>
                  </span>

                  {(view.outlook === 'due' || view.outlook === 'stalled') && (
                    <Button
                      variant={view.outlook === 'stalled' ? 'outline' : 'default'}
                      size="sm"
                      className="h-6 shrink-0 gap-1 text-[11px]"
                      title={
                        view.outlook === 'stalled'
                          ? 'Its window closed first; firing it now records how late it is'
                          : undefined
                      }
                      onClick={() =>
                        void actions.advance(run.id, view.step.id).then((result) => {
                          const fired = result.fired[0];
                          setNote(
                            fired
                              ? `${view.step.title}: ${fired.detail}${
                                  fired.lateSec > 0
                                    ? ` (${Math.round(fired.lateSec / 86_400)} days late)`
                                    : ''
                                }`
                              : 'Nothing to do yet.',
                          );
                        })
                      }
                    >
                      <PlayIcon className="size-3" />
                      Do it now
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>

          {analysis.stalled.length > 0 && (
            <p className="text-[11px] text-destructive">
              Nothing happens on its own: this step is past its date, so firing it
              takes a deliberate click — and the lateness is recorded when you do.
            </p>
          )}

          {note && (
            <p className="text-[11px] text-muted-foreground">{note}</p>
          )}

          {run.status !== 'running' && (
            <Badge variant="outline" className="w-fit text-[10px]">
              {run.status === 'completed' ? 'Finished' : 'Stopped'}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}
