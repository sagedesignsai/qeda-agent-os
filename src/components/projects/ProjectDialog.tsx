/**
 * components/projects/ProjectDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Create or edit a project. Deliberately small: a project earns its place by
 * being an outcome with an optional deadline and an optional repo, not by
 * carrying a settings page's worth of fields.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckIcon, FolderOpenIcon, XIcon } from 'lucide-react';
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
import {
  PROJECT_COLORS,
  PROJECT_ICON_NAMES,
  projectIcon,
} from '@/components/projects/ProjectCard';
import type { Notebook, Project, ProjectStatus } from '@/main/ipc/channels';
import type {
  CreateProjectInput,
  UpdateProjectPatch,
} from '@/hooks/use-projects';

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  project?: Project | null;
  onSubmit: (input: CreateProjectInput | UpdateProjectPatch) => Promise<void>;
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
}: ProjectDialogProps) {
  const editing = Boolean(project);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [repoPath, setRepoPath] = useState('');
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('');
  const [notebookId, setNotebookId] = useState('');
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setStatus(project?.status ?? 'active');
    setRepoPath(project?.repo_path ?? '');
    setIcon(project?.icon || 'folder');
    setColor(project?.color ?? '');
    setNotebookId(project?.notebook_id ?? '');
    setSaving(false);
  }, [open, project]);

  // Load notebooks lazily, once per open. Fresh each time is fine — a dialog is
  // short-lived and this avoids subscribing to a change event we do not own.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const list =
          await window.electron.ipc.invoke<Notebook[]>('notebooks:list');
        setNotebooks(list ?? []);
      } catch {
        setNotebooks([]);
      }
    })();
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim(),
        status,
        repo_path: repoPath.trim() || null,
        icon,
        color,
        notebook_id: notebookId || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

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
        if (!name.trim()) {
          const parts = selected.split(/[/|\\]/).filter(Boolean);
          const folderName = parts.pop();
          if (folderName) setName(folderName);
        }
      }
    } catch {
      // Best-effort
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            A project is an outcome — its tasks, repo, and docs all hang off it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ship the focus system"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Outcome</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One sentence describing what done looks like."
              rows={2}
            />
          </div>

          {/* Appearance: icon + colour. Both are stored on the project and
              rendered on the card, so they belong in configuration. */}
          <div className="grid grid-cols-[auto_1fr] items-start gap-4">
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="grid grid-cols-6 gap-1">
                {PROJECT_ICON_NAMES.map((name) => {
                  const Icon = projectIcon(name);
                  const selected = icon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setIcon(name)}
                      aria-label={`Use ${name} icon`}
                      aria-pressed={selected}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                        selected &&
                          'border-primary/60 bg-primary/10 text-primary',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {PROJECT_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColor(hex === color ? '' : hex)}
                    aria-label={`Use colour ${hex}`}
                    aria-pressed={color === hex}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border border-border/60 transition-transform hover:scale-110',
                      color === hex && 'ring-2 ring-ring/60 ring-offset-1',
                    )}
                    style={{ backgroundColor: hex }}
                  >
                    {color === hex && (
                      <CheckIcon className="size-3 text-white" />
                    )}
                  </button>
                ))}
                <label
                  className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border/80 text-[9px] text-muted-foreground"
                  title="Custom colour"
                >
                  +
                  <input
                    type="color"
                    value={color || '#10b981'}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Custom project colour"
                  />
                </label>
                {color && (
                  <button
                    type="button"
                    onClick={() => setColor('')}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ProjectStatus)}
            >
              <SelectTrigger id="project-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="project-notebook">Linked notebook</Label>
              <span className="text-[10px] text-muted-foreground">
                Optional
              </span>
            </div>
            <Select
              value={notebookId || '__none__'}
              onValueChange={(v) => setNotebookId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger id="project-notebook">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {notebooks.map((nb) => (
                  <SelectItem key={nb.id} value={nb.id}>
                    {nb.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Collect docs and notes for this project in one notebook.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="project-repo">Repo path</Label>
              <span className="text-[10px] text-muted-foreground">
                Optional
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="project-repo"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/data/projects/…"
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
              Terminal sessions in this project start here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || saving}
          >
            {editing ? 'Save' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
