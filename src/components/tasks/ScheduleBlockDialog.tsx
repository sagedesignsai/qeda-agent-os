/**
 * components/tasks/ScheduleBlockDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Turn a task (or a standalone activity) into a concrete time box for today.
 * Picking a slot is deliberately a two-field decision — what and when — so
 * scheduling never becomes its own project.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Task } from '@/main/ipc/channels';

const DURATIONS = [15, 25, 45, 60, 90, 120] as const;

export interface ScheduleBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open tasks that can be scheduled. */
  tasks: Task[];
  /** Pre-select this task when the dialog opens. */
  presetTaskId?: string | null;
  onSaved: () => void;
}

/** Next half-hour boundary as `HH:MM`. */
function nextSlot(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + (30 - (d.getMinutes() % 30)), 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Local `HH:MM` today → unix seconds. */
function todayAt(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function ScheduleBlockDialog({
  open,
  onOpenChange,
  tasks,
  presetTaskId,
  onSaved,
}: ScheduleBlockDialogProps) {
  const [target, setTarget] = useState<string>('custom');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(nextSlot);
  const [duration, setDuration] = useState<number>(45);
  const [saving, setSaving] = useState(false);

  // Seed the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (presetTaskId && tasks.some((t) => t.id === presetTaskId)) {
      setTarget(presetTaskId);
      const preset = tasks.find((t) => t.id === presetTaskId);
      setDuration(preset?.estimate_mins ?? 45);
    } else {
      setTarget('custom');
    }
    setTime(nextSlot());
  }, [open, presetTaskId, tasks]);

  const targetTask = useMemo(
    () => tasks.find((t) => t.id === target) ?? null,
    [tasks, target],
  );

  const canSave = target !== 'custom' || title.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const start = todayAt(time);
      await window.electron.ipc.invoke('tasks:block-create', {
        task_id: target === 'custom' ? null : target,
        title: target === 'custom' ? title.trim() : '',
        start_at: start,
        end_at: start + duration * 60,
      });
      toast.success('Time blocked');
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error('Could not schedule block');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlusIcon className="size-4" />
            Block time
          </DialogTitle>
          <DialogDescription>
            Decide when it happens, and it stops competing for attention.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-target">What</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="block-target" className="w-full">
                <SelectValue placeholder="Choose a task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Something else…</SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="block-title">Label</Label>
              <Input
                id="block-title"
                placeholder="e.g. Inbox zero"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="block-time">Start</Label>
              <Input
                id="block-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="block-duration">Minutes</Label>
              <Select
                value={String(duration)}
                onValueChange={(v) => setDuration(Number(v))}
              >
                <SelectTrigger id="block-duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {targetTask?.estimate_mins && (
            <p className="text-[11px] text-muted-foreground">
              Estimated at {targetTask.estimate_mins} min.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>
            Block it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
