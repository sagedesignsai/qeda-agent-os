/**
 * components/tasks/TaskDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One dialog for creating and editing tasks, because they are the same form
 * with different defaults. Carries every field the data model supports and the
 * board can show: title, description, priority, estimate, due date, and the
 * owning project.
 *
 * In create mode the form resets each time it opens; in edit mode it seeds
 * from the task and submits only the fields that changed, so an edit that
 * touches nothing costs nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Project, Task } from '@/main/ipc/channels';
import type {
  CreateTaskInput,
  UpdateTaskPatch,
} from '@/hooks/use-task-mutations';

export type TaskPriority = 1 | 2 | 3;

export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  task?: Task | null;
  /** Projects to offer in the picker; the picker renders when non-empty. */
  projects?: Project[];
  /** Pre-selected project id in create mode (a scoped surface). */
  defaultProjectId?: string | null;
  onSubmit: (data: CreateTaskInput | UpdateTaskPatch) => Promise<void> | void;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 1, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Low' },
];

const ESTIMATE_CHIPS = [15, 25, 45, 90] as const;

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` for a `<input type="date">` from unix seconds. */
function toDateInput(epochSec: number | null | undefined): string {
  if (epochSec === null || epochSec === undefined) return '';
  const d = new Date(epochSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Midnight local time in unix seconds for a `YYYY-MM-DD` string, or null. */
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  projects = [],
  defaultProjectId = null,
  onSubmit,
}: TaskDialogProps) {
  const editing = Boolean(task);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [estimate, setEstimate] = useState('');
  const [due, setDue] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  const seed = useMemo(
    () => ({
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: (task?.priority ?? 2) as TaskPriority,
      estimate: task?.estimate_mins ? String(task.estimate_mins) : '',
      due: toDateInput(task?.due_at),
      project: task?.project_id ?? defaultProjectId ?? 'none',
    }),
    [task, defaultProjectId],
  );

  // Create mode resets on every open; edit mode re-seeds when the task changes.
  useEffect(() => {
    if (!open) return;
    setTitle(seed.title);
    setDescription(seed.description);
    setPriority(seed.priority);
    setEstimate(seed.estimate);
    setDue(seed.due);
    setProjectId(seed.project);
    setSaving(false);
  }, [open, seed]);

  const parsedEstimate = Number(estimate);
  const nextEstimate =
    estimate.trim() && Number.isFinite(parsedEstimate) && parsedEstimate > 0
      ? Math.floor(parsedEstimate)
      : null;

  /** Fields whose value differs from the seed — edit submits only these. */
  const changed = (): UpdateTaskPatch => {
    const patch: UpdateTaskPatch = {};
    if (title.trim() !== seed.title) patch.title = title.trim();
    if (description.trim() !== seed.description) {
      patch.description = description.trim();
    }
    if (priority !== seed.priority) patch.priority = priority;
    if (
      (nextEstimate ?? null) !== (seed.estimate ? Number(seed.estimate) : null)
    ) {
      patch.estimate_mins = nextEstimate;
    }
    if ((fromDateInput(due) ?? null) !== (task?.due_at ?? null)) {
      patch.due_at = fromDateInput(due);
    }
    if (projectId !== seed.project) {
      patch.project_id = projectId === 'none' ? null : projectId;
    }
    return patch;
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await onSubmit(changed());
      } else {
        await onSubmit({
          title: trimmed,
          description: description.trim(),
          priority,
          estimate_mins: nextEstimate,
          due_at: fromDateInput(due),
          project_id: projectId === 'none' ? null : projectId,
        } satisfies CreateTaskInput);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes save to the board immediately.'
              : 'Add a task to your backlog.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Draft the changelog"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One clarifying sentence (optional)…"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                value={String(priority)}
                onValueChange={(v) => setPriority(Number(v) as TaskPriority)}
              >
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estimate</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ESTIMATE_CHIPS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() =>
                    setEstimate(nextEstimate === mins ? '' : String(mins))
                  }
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    nextEstimate === mins
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {mins}m
                </button>
              ))}
              <Input
                type="number"
                min={5}
                step={5}
                placeholder="mins"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                className="h-7 w-20 text-xs"
                aria-label="Estimate in minutes"
              />
            </div>
          </div>

          {projects.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="task-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="task-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inbox (unsorted)</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || saving}
          >
            {editing ? 'Save changes' : 'Add task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
