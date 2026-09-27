/**
 * components/tasks/MorningKickoffDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 60-Second Morning Flow Kickoff: "Pick 1 Highlight + 2 Support Blocks".
 *
 * Eliminates decision paralysis by structuring the day into realistic, finite
 * deep work blocks. Awards +40 XP bonus upon commitment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  CalendarIcon,
  CheckCircle2Icon,
  CompassIcon,
  FlameIcon,
  Loader2Icon,
  SparklesIcon,
  SunIcon,
  ZapIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGamification } from '@/hooks/use-gamification';
import { triggerParticleBurst } from '@/components/gamification/ParticleCanvas';
import { XP_REWARDS } from '@/lib/gamification';
import type { Task } from '@/main/ipc/channels';

export interface MorningKickoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  projectId?: string | null;
  onScheduled: () => void;
  onStartFocus?: (task: Task) => void;
}

export function MorningKickoffDialog({
  open,
  onOpenChange,
  tasks,
  projectId,
  onScheduled,
  onStartFocus,
}: MorningKickoffDialogProps) {
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const [highlightId, setHighlightId] = useState<string>('');
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const gamification = useGamification();

  const handleToggleSupport = (id: string) => {
    setSupportIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        toast.info('Maximum 2 supporting tasks for sustainable flow');
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCommit = async (e: React.MouseEvent) => {
    if (!highlightId) {
      toast.error('Please pick your #1 Highlight for today');
      return;
    }

    setIsCommitting(true);
    try {
      const now = new Date();
      // Round to next 30-min block
      now.setMinutes(now.getMinutes() + (30 - (now.getMinutes() % 30)), 0, 0);
      let currentStartSec = Math.floor(now.getTime() / 1000);

      const highlightTask = openTasks.find((t) => t.id === highlightId);
      const chosenSupportTasks = openTasks.filter((t) =>
        supportIds.includes(t.id),
      );

      // Block 1: Highlight (90 minutes deep work block)
      if (highlightTask) {
        const durationSec = 90 * 60;
        await window.electron.ipc.invoke('tasks:block-create', {
          task_id: highlightTask.id,
          project_id: projectId ?? null,
          title: highlightTask.title,
          start_at: currentStartSec,
          end_at: currentStartSec + durationSec,
        });
        currentStartSec += durationSec + 15 * 60; // 15m break buffer
      }

      // Block 2 & 3: Support tasks (45 minutes each)
      for (const supportTask of chosenSupportTasks) {
        const durationSec = 45 * 60;
        await window.electron.ipc.invoke('tasks:block-create', {
          task_id: supportTask.id,
          project_id: projectId ?? null,
          title: supportTask.title,
          start_at: currentStartSec,
          end_at: currentStartSec + durationSec,
        });
        currentStartSec += durationSec + 15 * 60;
      }

      // Award Day Plan bonus XP!
      await gamification.awardXp(
        XP_REWARDS.DAY_PLAN,
        'morning_kickoff',
        highlightId,
      );
      triggerParticleBurst(e.clientX, e.clientY);

      toast.success('Day locked in! +40 XP awarded', {
        description: '3 time-blocks have been scheduled on your Today timeline.',
      });

      onScheduled();
      onOpenChange(false);

      if (highlightTask && onStartFocus) {
        onStartFocus(highlightTask);
      }
    } catch {
      toast.error('Could not schedule morning kickoff blocks');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-amber-500/10 p-1.5 text-amber-500">
              <SunIcon className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Morning Flow Kickoff
            </DialogTitle>
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] font-bold text-amber-500"
            >
              +40 XP
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Build sustainable daily momentum: choose{' '}
            <strong className="text-foreground">1 Highlight</strong> and up to{' '}
            <strong className="text-foreground">2 Support Blocks</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: 1 Highlight */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <FlameIcon className="size-3.5 fill-amber-500 text-amber-500" />
              <span>Step 1: Pick your #1 Daily Highlight (90m Deep Work)</span>
            </div>
            <ScrollArea className="h-36 rounded-lg border border-border/60 p-2">
              <RadioGroup
                value={highlightId}
                onValueChange={(val) => {
                  setHighlightId(val);
                  setSupportIds((prev) => prev.filter((id) => id !== val));
                }}
                className="space-y-1"
              >
                {openTasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
                  >
                    <RadioGroupItem value={t.id} />
                    <span className="flex-1 truncate font-medium text-foreground">
                      {t.title}
                    </span>
                    <Badge
                      variant="outline"
                      className="h-4 border-0 px-1 text-[9px]"
                    >
                      P{t.priority}
                    </Badge>
                  </label>
                ))}
                {openTasks.length === 0 && (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No open tasks available.
                  </p>
                )}
              </RadioGroup>
            </ScrollArea>
          </div>

          {/* Step 2: Support Blocks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <CompassIcon className="size-3.5 text-sky-400" />
                <span>Step 2: Up to 2 Supporting Blocks (45m each)</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {supportIds.length}/2 selected
              </span>
            </div>
            <ScrollArea className="h-36 rounded-lg border border-border/60 p-2">
              <div className="space-y-1">
                {openTasks
                  .filter((t) => t.id !== highlightId)
                  .map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={supportIds.includes(t.id)}
                        onCheckedChange={() => handleToggleSupport(t.id)}
                      />
                      <span className="flex-1 truncate font-medium text-foreground">
                        {t.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 border-0 px-1 text-[9px]"
                      >
                        P{t.priority}
                      </Badge>
                    </label>
                  ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            ⚡ Automatically spaces out blocks with 15m restorative breaks.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
              disabled={!highlightId || isCommitting}
              onClick={handleCommit}
            >
              {isCommitting ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <ZapIcon className="size-3.5 fill-current" />
              )}
              Lock In Day (+40 XP)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
