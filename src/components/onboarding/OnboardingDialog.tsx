/**
 * components/onboarding/OnboardingDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The first-launch welcome flow. It appears once, over whatever route the app
 * opened on, and walks a brand-new user from an empty database to a named
 * project with an optional first task.
 *
 *   Welcome ─▶ Project ─▶ First task ─▶ Done
 *
 * Every step is skippable: this is a system for people who find long setup a
 * barrier, so the flow must never trap them. Skipping or finishing writes
 * `onboardingCompleted` to settings, which is what makes it a one-time event.
 *
 * The project is created when leaving the "First task" step, not the "Project"
 * step, so going back to edit details can never leave a half-made project
 * behind.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  FolderOpenIcon,
  Loader2Icon,
  SparklesIcon,
  TargetIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { QedaLogomark } from '@/components/QedaLogo';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import type { Task } from '@/main/ipc/channels';

type Priority = 1 | 2 | 3;

const ESTIMATE_CHIPS = [15, 25, 45, 90] as const;

export interface OnboardingDialogProps {
  open: boolean;
  /** Persist the flag and close (used for both skip and finish). */
  onClose: () => void;
  /** Jump into the project from the final step. */
  onOpenProject: (id: string) => void;
}

const STEP_TITLES = ['Welcome', 'Project', 'First task', 'Ready'] as const;

/** `YYYY-MM-DD` for a `<input type="date">` → unix seconds at local midnight. */
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

/** Mark onboarding complete in settings (best-effort). */
async function persistCompletion(): Promise<void> {
  try {
    await window.electron.ipc.invoke('settings:save', {
      onboardingCompleted: true,
    });
  } catch {
    // Failing to persist only means the flow reappears next launch.
  }
}

export function OnboardingDialog({
  open,
  onClose,
  onOpenProject,
}: OnboardingDialogProps) {
  const { createProject } = useProjects();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskEstimate, setTaskEstimate] = useState<number | null>(45);
  const [taskPriority, setTaskPriority] = useState<Priority>(2);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Reset the whole flow each time it opens, so a skip-then-reopen is clean.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName('');
    setDescription('');
    setDeadline('');
    setRepoPath('');
    setTaskTitle('');
    setTaskEstimate(45);
    setTaskPriority(2);
    setSaving(false);
    setCreatedId(null);
  }, [open]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        deadline: fromDateInput(deadline),
        repo_path: repoPath.trim() || null,
      });

      if (project && taskTitle.trim()) {
        try {
          await window.electron.ipc.invoke<Task>('tasks:create', {
            title: taskTitle.trim(),
            project_id: project.id,
            estimate_mins: taskEstimate,
            priority: taskPriority,
            status: 'backlog',
          });
        } catch {
          toast.error('Could not add the first task', {
            description: 'Your project was created — you can add tasks later.',
          });
        }
      }

      await persistCompletion();
      setCreatedId(project?.id ?? null);
      setStep(3);
    } catch {
      toast.error('Could not create your project');
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    await persistCompletion();
    onClose();
  };

  const canAdvanceProject = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing via Escape/backdrop counts as a skip.
        if (!next) void skip();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <StepDots step={step} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            {step === 0 && <WelcomeStep />}

            {step === 1 && (
              <ProjectStep
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                deadline={deadline}
                setDeadline={setDeadline}
                repoPath={repoPath}
                setRepoPath={setRepoPath}
              />
            )}

            {step === 2 && (
              <FirstTaskStep
                projectName={name.trim()}
                taskTitle={taskTitle}
                setTaskTitle={setTaskTitle}
                taskEstimate={taskEstimate}
                setTaskEstimate={setTaskEstimate}
                taskPriority={taskPriority}
                setTaskPriority={setTaskPriority}
              />
            )}

            {step === 3 && <ReadyStep projectName={name.trim()} />}
          </motion.div>
        </AnimatePresence>

        <DialogFooter className="sm:justify-between">
          {step === 0 ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void skip()}>
                Skip for now
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setStep(1)}>
                Get started
                <ArrowRightIcon className="size-3.5" />
              </Button>
            </>
          ) : step === 3 ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Stay in Inbox
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (createdId) onOpenProject(createdId);
                  else onClose();
                }}
              >
                <TargetIcon className="size-3.5" />
                Open project
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ArrowLeftIcon className="size-3.5" />
                Back
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={saving || (step === 1 && !canAdvanceProject)}
                onClick={() => {
                  if (step === 2) void finish();
                  else setStep((s) => s + 1);
                }}
              >
                {saving && <Loader2Icon className="size-3.5 animate-spin" />}
                {step === 2 && taskTitle.trim()
                  ? 'Create project & task'
                  : step === 2
                    ? 'Create project'
                    : 'Continue'}
                {!saving && <ArrowRightIcon className="size-3.5" />}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_TITLES.map((title, i) => (
        <div key={title} className="flex items-center gap-2">
          <span
            className={cn(
              'size-1.5 rounded-full transition-colors',
              i <= step ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          />
        </div>
      ))}
      <span className="ml-auto text-[11px] text-muted-foreground">
        Step {step + 1} of {STEP_TITLES.length}
      </span>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <>
      <DialogHeader>
        <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-card border border-border/80 text-foreground shadow-sm">
          <QedaLogomark
            size="sm"
            ringClassName="text-foreground"
            boltClassName="text-sky-400"
            animated
          />
        </div>
        <DialogTitle className="text-xl">Welcome to Qeda</DialogTitle>
        <DialogDescription>
          Qeda organises work around <strong>projects</strong> — an outcome, its
          tasks, the repo you build it in, and the docs that describe it.
          Let&apos;s set up your first one. It takes about thirty seconds.
        </DialogDescription>
      </DialogHeader>
      <ul className="mt-1 space-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <CheckIcon className="size-3.5 text-emerald-500" />
          Capture tasks straight into a project
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon className="size-3.5 text-emerald-500" />
          Block time and track focus against it
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon className="size-3.5 text-emerald-500" />
          Hand work to the terminal and chat agents
        </li>
      </ul>
    </>
  );
}

interface ProjectStepProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  repoPath: string;
  setRepoPath: (v: string) => void;
}

function ProjectStep({
  name,
  setName,
  description,
  setDescription,
  deadline,
  setDeadline,
  repoPath,
  setRepoPath,
}: ProjectStepProps) {
  const handleChooseDirectory = async () => {
    try {
      const selected = await window.electron.ipc.invoke<string | null>(
        'dialog:open-directory',
        {
          defaultPath: repoPath || undefined,
          title: 'Select Project Directory',
        },
      );
      if (selected) {
        setRepoPath(selected);
        // If the project name is currently empty, suggest the folder's name
        if (!name.trim()) {
          const parts = selected.split(/[/|\\]/).filter(Boolean);
          const folderName = parts.pop();
          if (folderName) {
            setName(folderName);
          }
        }
      }
    } catch {
      // Best-effort
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Name your project</DialogTitle>
        <DialogDescription>
          What outcome are you working toward? You can change all of this later.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-name">Name</Label>
          <Input
            id="ob-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ship the onboarding flow"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-outcome">Outcome</Label>
          <Textarea
            id="ob-outcome"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One sentence describing what done looks like."
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ob-repo">Directory location</Label>
            <span className="text-[10px] text-muted-foreground">Optional</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                id="ob-repo"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="Choose a directory or type path…"
                className="font-mono text-xs pr-8"
              />
              {repoPath && (
                <button
                  type="button"
                  onClick={() => setRepoPath('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                  title="Clear directory"
                  aria-label="Clear directory"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleChooseDirectory()}
              className="shrink-0 gap-1.5 border-border/80 text-xs hover:bg-accent"
              title="Select folder using native file picker"
            >
              <FolderOpenIcon className="size-3.5 text-primary/80" />
              Browse…
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Terminal sessions and agents in this project will run from this
            folder.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-deadline">Deadline</Label>
          <Input
            id="ob-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

interface FirstTaskStepProps {
  projectName: string;
  taskTitle: string;
  setTaskTitle: (v: string) => void;
  taskEstimate: number | null;
  setTaskEstimate: (v: number | null) => void;
  taskPriority: Priority;
  setTaskPriority: (v: Priority) => void;
}

function FirstTaskStep({
  projectName,
  taskTitle,
  setTaskTitle,
  taskEstimate,
  setTaskEstimate,
  taskPriority,
  setTaskPriority,
}: FirstTaskStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>What&apos;s the first step?</DialogTitle>
        <DialogDescription>
          One concrete task for <strong>{projectName || 'your project'}</strong>
          . Skip this if you&apos;d rather start empty.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-task">Task</Label>
          <Input
            id="ob-task"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Sketch the welcome screen"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label>Estimate</Label>
          <div className="flex flex-wrap gap-1.5">
            {ESTIMATE_CHIPS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() =>
                  setTaskEstimate(taskEstimate === mins ? null : mins)
                }
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  taskEstimate === mins
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-priority">Priority</Label>
          <Select
            value={String(taskPriority)}
            onValueChange={(v) => setTaskPriority(Number(v) as Priority)}
          >
            <SelectTrigger id="ob-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}

function ReadyStep({ projectName }: { projectName: string }) {
  return (
    <>
      <DialogHeader>
        <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-emerald-500/15">
          <CheckIcon className="size-5 text-emerald-500" />
        </div>
        <DialogTitle>You&apos;re set up</DialogTitle>
        <DialogDescription>
          <strong>{projectName || 'Your project'}</strong> is ready. Tasks, time
          blocks, terminal sessions, and chats you create from here can all
          point back at it — and the Inbox is always there for quick capture.
        </DialogDescription>
      </DialogHeader>
    </>
  );
}
