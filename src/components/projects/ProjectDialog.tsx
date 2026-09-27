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
import type { Project, ProjectStatus } from '@/main/ipc/channels';
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

/** `YYYY-MM-DD` for a `<input type="date">` from unix seconds. */
function toDateInput(epochSec: number | null | undefined): string {
  if (epochSec === null || epochSec === undefined) return '';
  const d = new Date(epochSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Midnight local time in unix seconds for a `YYYY-MM-DD` string. */
function fromDateInput(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
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
  const [deadline, setDeadline] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setStatus(project?.status ?? 'active');
    setDeadline(toDateInput(project?.deadline));
    setRepoPath(project?.repo_path ?? '');
    setSaving(false);
  }, [open, project]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim(),
        status,
        deadline: fromDateInput(deadline),
        repo_path: repoPath.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
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

          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="project-deadline">Deadline</Label>
              <Input
                id="project-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-repo">Repo path</Label>
            <Input
              id="project-repo"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/data/projects/…"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Terminal sessions in this project start here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!name.trim() || saving}>
            {editing ? 'Save' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
