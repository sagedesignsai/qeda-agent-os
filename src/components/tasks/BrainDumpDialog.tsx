/**
 * components/tasks/BrainDumpDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Brain dump" — paste unfiltered thoughts, get back a small set of real tasks.
 *
 * Built on the ai-elements PromptInput so the interaction matches the rest of
 * the app's AI surfaces (Enter to submit, a real submit affordance, status).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { BrainIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Task } from '@/main/ipc/channels';

export interface BrainDumpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the tasks the copilot created, for optimistic board updates. */
  onCreated: (tasks: Task[]) => void;
}

const PRIORITY_TINT: Record<number, string> = {
  1: 'border-rose-500/40 text-rose-500',
  2: 'border-amber-500/40 text-amber-500',
  3: 'border-zinc-500/40 text-muted-foreground',
};

export function BrainDumpDialog({
  open,
  onOpenChange,
  onCreated,
}: BrainDumpDialogProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<Task[]>([]);

  const reset = () => {
    setNote('');
    setCreated([]);
    setBusy(false);
  };

  const handleSubmit = async ({ text }: { text: string }) => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const result = await window.electron.ipc.invoke<{
        tasks: Task[];
        note: string;
      }>('tasks:brain-dump', { text: value });
      setCreated(result.tasks ?? []);
      setNote(result.note ?? '');
      onCreated(result.tasks ?? []);
      if ((result.tasks ?? []).length > 0) {
        toast.success(
          `Added ${result.tasks.length} task${result.tasks.length > 1 ? 's' : ''}`,
        );
      } else {
        toast.info('Nothing actionable found', {
          description: result.note?.slice(0, 140),
        });
      }
    } catch {
      toast.error('Could not process brain dump', {
        description: 'Check your model settings and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainIcon className="size-4 text-violet-500" />
            Brain dump
          </DialogTitle>
          <DialogDescription>
            Get it out of your head. The copilot turns it into a few real tasks
            — duplicates merged, priorities assigned.
          </DialogDescription>
        </DialogHeader>

        <PromptInput onSubmit={handleSubmit} className="max-h-none">
          <PromptInputBody>
            <PromptInputTextarea
              autoFocus
              placeholder="Everything rattling around — calls to make, things to fix, half-finished ideas…"
              className="max-h-40 min-h-28"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <span className="px-1 text-[11px] text-muted-foreground">
                Enter to untangle
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              status={busy ? 'submitted' : undefined}
              disabled={busy}
            />
          </PromptInputFooter>
        </PromptInput>

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            Untangling and prioritizing…
          </div>
        )}

        {note && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {note}
          </p>
        )}

        {created.length > 0 && (
          <ul className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
            {created.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
              >
                <SparklesIcon className="size-3 shrink-0 text-amber-500" />
                <span className="flex-1 truncate text-xs">{task.title}</span>
                <Badge
                  variant="outline"
                  className={`h-4 border-0 px-0 text-[10px] ${PRIORITY_TINT[task.priority] ?? ''}`}
                >
                  {task.priority === 1
                    ? 'High'
                    : task.priority === 2
                      ? 'Med'
                      : 'Low'}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {created.length > 0 ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
