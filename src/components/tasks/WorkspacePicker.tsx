/**
 * components/tasks/WorkspacePicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The backbone hand-off: when a user explicitly starts a task, they choose
 * which execution workspace to work in. Suggest-then-confirm UX — a suggested
 * default, a remembered recent choice, and "Just Focus" as the escape. Esc
 * cancels (no navigation); the timer is never auto-started from here.
 */

import { useEffect, useRef } from 'react';
import {
  MessageSquareIcon,
  TerminalIcon,
  FileTextIcon,
  WandSparklesIcon,
  FocusIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Task } from '@/main/ipc/channels';
import {
  getSuggestedWorkspace,
  type WorkspaceKind,
} from '@/lib/workspace-suggestion';
import { getLastWorkspace } from '@/lib/task-launch';

export interface WorkspacePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  projectName?: string | null;
  onSelect: (workspace: WorkspaceKind) => void | Promise<void>;
  /** "Just Focus" is routed through onSelect('focus') for a single code path. */
  onJustFocus: () => void;
}

interface WorkspaceOption {
  kind: WorkspaceKind;
  label: string;
  blurb: string;
  icon: LucideIcon;
  disabled?: boolean;
  disabledReason?: string;
}

const OPTIONS: WorkspaceOption[] = [
  {
    kind: 'chat',
    label: 'Chat & Research',
    blurb: 'Plan, research, break down',
    icon: MessageSquareIcon,
  },
  {
    kind: 'terminal',
    label: 'Terminal',
    blurb: 'Run shell agent',
    icon: TerminalIcon,
  },
  {
    kind: 'documents',
    label: 'Documents',
    blurb: 'Write paper with AI',
    icon: FileTextIcon,
  },
  {
    kind: 'builder',
    label: 'Builder',
    blurb: 'Code project (soon)',
    icon: WandSparklesIcon,
    disabled: true,
    disabledReason: 'Coming soon',
  },
  {
    kind: 'focus',
    label: 'Just Focus',
    blurb: 'Timer only, no workspace',
    icon: FocusIcon,
  },
];

export function WorkspacePicker({
  open,
  onOpenChange,
  task,
  projectName,
  onSelect,
  onJustFocus,
}: WorkspacePickerProps) {
  const suggested = task ? getSuggestedWorkspace(task) : null;
  const recent = task ? getLastWorkspace(task.project_id ?? null) : null;
  const firstFocusable = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Auto-focus the suggested action so Enter confirms the default
      // (keyboard-first, no modal fatigue).
      requestAnimationFrame(() => firstFocusable.current?.focus());
    }
  }, [open, task?.id]);

  if (!task) return null;

  const handlePick = (kind: WorkspaceKind) => {
    if (kind === 'focus') {
      onJustFocus();
      return;
    }
    void onSelect(kind);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          // We manage focus ourselves to land on the suggested option.
          e.preventDefault();
          firstFocusable.current?.focus();
        }}
        aria-describedby="workspace-picker-desc"
      >
        <DialogHeader>
          <DialogTitle className="text-left">Start: {task.title}</DialogTitle>
          <DialogDescription id="workspace-picker-desc" className="text-left">
            {projectName ? `${projectName} · ` : ''}
            {task.description
              ? task.description.slice(0, 80)
              : 'Choose where to work. The task is marked active; the timer starts only when you press play.'}
          </DialogDescription>
        </DialogHeader>

        <div
          role="listbox"
          aria-label="Choose a workspace"
          className="flex flex-col gap-1.5"
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSuggested = suggested?.workspace === opt.kind;
            const isRecent = recent === opt.kind && !isSuggested;
            const isFocus = opt.kind === 'focus';

            return (
              <button
                key={opt.kind}
                ref={isSuggested ? firstFocusable : undefined}
                type="button"
                role="option"
                aria-selected={isSuggested}
                disabled={opt.disabled}
                onClick={() => handlePick(opt.kind)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  isSuggested
                    ? 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15'
                    : 'border-border/60 bg-card/40 hover:border-primary/40 hover:bg-accent/40',
                  opt.disabled && 'cursor-not-allowed opacity-40',
                  isFocus && 'border-dashed',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md',
                    isSuggested
                      ? 'bg-amber-500/20 text-amber-500'
                      : 'bg-muted/60 text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {opt.label}
                    {isSuggested && (
                      <Badge className="h-4 gap-0.5 border-0 bg-amber-500/20 px-1 text-[9px] font-bold text-amber-400">
                        <SparklesIcon className="size-2.5" />
                        Suggested
                      </Badge>
                    )}
                    {isRecent && (
                      <Badge
                        variant="secondary"
                        className="h-4 px-1 text-[9px] font-bold"
                      >
                        Recent
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {opt.disabled ? opt.disabledReason : opt.blurb}
                  </span>
                </span>
                {isSuggested && (
                  <span className="text-[10px] font-medium text-amber-500">
                    Enter
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-muted-foreground">
            Esc to cancel · Timer starts only when you press play
          </p>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
