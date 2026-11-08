/**
 * components/projects/ProjectDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Create or edit a project — the onboarding moment of the app.
 *
 * Design notes:
 *  - Wide, two-column layout: essentials (name, outcome, status-when-editing)
 *    on the left; an identity rail on the right with a live preview card
 *    (mirroring the real board tile) above the icon/colour pickers, so the
 *    pickers' payoff is visible immediately. The optional "hook it up"
 *    (notebook + repo) sits full-width below, visually parked.
 *  - Fresh projects are auto-branded: the name suggests an icon via keyword
 *    hints and a palette colour not yet claimed by other projects. Any manual
 *    pick permanently overrides the suggestions for that field.
 *  - A name is the only requirement. Status only appears when editing (a
 *    created project starts Active by definition).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
  PROJECT_STATUS_META,
  projectIcon,
} from '@/components/projects/ProjectCard';
import { useProjects } from '@/hooks/use-projects';
import type { Notebook, Project, ProjectStatus } from '@/main/ipc/channels';
import type {
  CreateProjectInput,
  UpdateProjectPatch,
} from '@/hooks/use-projects';

// ─── Auto-branding heuristics ────────────────────────────────────────────────

/** Keyword → icon hints, matched against the project name (or folder name). */
const ICON_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ship|launch|releas|deploy|kick/i, 'rocket'],
  [/fix|bug|debug|crash/i, 'bug'],
  [/doc|note|write|brief|manual|book/i, 'book'],
  [/design|brand|paint|art|ui\b/i, 'palette'],
  [/music|audio|song|sound|album/i, 'music'],
  [/video|film|record|studio|movie/i, 'video'],
  [/terminal|\bcli\b|shell|command/i, 'terminal'],
  [/research|experiment|lab|study/i, 'flask'],
  [/client|work|invoice|business/i, 'briefcase'],
  [/code|dev|api|refactor|sdk/i, 'code'],
  [/web|site|internet|online/i, 'globe'],
  [/health|care|fitness|habit/i, 'heart'],
  [/idea|brainstorm|concept|inspire/i, 'lightbulb'],
  [/tool|repair|maintain|setup/i, 'wrench'],
  [/task|kanban|board|plan|sprint/i, 'kanban'],
  [/capture|collect|inbox|triage/i, 'inbox'],
  [/goal|target|okr|milestone/i, 'target'],
];

/** Hash-based fallback for names that match nothing — keeps tiles varied. */
const ICON_ROTATION: readonly string[] = [
  'rocket',
  'lightbulb',
  'kanban',
  'flask',
  'target',
  'book',
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function suggestIcon(name: string): string {
  const trimmed = name.trim();
  for (const [pattern, icon] of ICON_HINTS) {
    if (pattern.test(trimmed)) return icon;
  }
  // No keyword match — rotate through pleasant defaults so tiles still vary.
  return ICON_ROTATION[hashString(trimmed.toLowerCase()) % ICON_ROTATION.length];
}

/** First palette colour not claimed by another project; hash pick as fallback. */
function suggestColor(
  name: string,
  rollups: Array<{ project: Project }>,
  selfId?: string,
): string {
  const used = new Set(
    rollups
      .filter((r) => r.project.id !== selfId && r.project.color)
      .map((r) => r.project.color as string),
  );
  const free = PROJECT_COLORS.filter((c) => !used.has(c));
  const pool = free.length > 0 ? free : PROJECT_COLORS;
  return pool[hashString(name.trim().toLowerCase()) % pool.length];
}

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
  const { rollups } = useProjects();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [repoPath, setRepoPath] = useState('');
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('');
  const [notebookId, setNotebookId] = useState('');
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [saving, setSaving] = useState(false);

  // Manual picks win forever (per field, per open session) over suggestions.
  const iconLocked = useRef(false);
  const colorLocked = useRef(false);

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
    iconLocked.current = Boolean(project?.icon);
    colorLocked.current = Boolean(project?.color);
  }, [open, project]);

  // Auto-brand freshly typed names: suggest an icon and a free palette colour
  // after a short typing pause. Editing skips this — the project already has
  // an identity.
  useEffect(() => {
    if (!open || editing) return;
    const trimmed = name.trim();
    if (trimmed.length < 3) return;
    if (iconLocked.current && colorLocked.current) return;
    const timer = setTimeout(() => {
      if (!iconLocked.current) setIcon(suggestIcon(trimmed));
      if (!colorLocked.current) setColor(suggestColor(trimmed, rollups));
    }, 350);
    return () => clearTimeout(timer);
  }, [name, open, editing, rollups]);

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

  const PreviewIcon = projectIcon(icon);
  const previewStatus = PROJECT_STATUS_META[editing ? status : 'active'];
  const draftName = name.trim();
  const draftOutcome = description.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit project' : 'Start a project'}
          </DialogTitle>
          <DialogDescription>
            A project is the home for an outcome — its tasks, docs, and repo all
            live here. A name is all you need to begin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Essentials column — the only truly required path. */}
          <div className="grid content-start gap-4">
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
              <p className="text-[11px] text-muted-foreground">
                We'll suggest an icon and colour from it — change anything you
                like.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-description">Outcome</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does done look like? e.g. Checkout works on mobile."
                rows={3}
              />
            </div>

            {/* Status is a lifecycle fact, not a creation choice: every new
                project starts Active, so the control only exists when editing. */}
            {editing && (
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
            )}
          </div>

          {/* Identity rail — preview first, so every pick shows its payoff. */}
          <div className="grid content-start gap-4">
            <div className="rounded-xl border bg-card/40 p-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 transition-colors"
                  style={
                    color
                      ? { color, borderColor: `${color}55` }
                      : undefined
                  }
                >
                  <PreviewIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'truncate text-sm font-medium',
                        !draftName && 'text-muted-foreground',
                      )}
                    >
                      {draftName || 'Untitled project'}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px] font-normal',
                        previewStatus.className,
                      )}
                    >
                      {previewStatus.label}
                    </Badge>
                  </div>
                  {draftOutcome ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {draftOutcome}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground/60 italic">
                      Your outcome will show here.
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground/70">
                This is how it appears on your board.
              </p>
            </div>

            {/* Appearance: icon + colour. Both are stored on the project and
                rendered on the card, so they belong in configuration. */}
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="grid grid-cols-6 gap-1">
                {PROJECT_ICON_NAMES.map((iconName) => {
                  const Icon = projectIcon(iconName);
                  const selected = icon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => {
                        iconLocked.current = true;
                        setIcon(iconName);
                      }}
                      aria-label={`Use ${iconName} icon`}
                      aria-pressed={selected}
                      title={
                        iconName.charAt(0).toUpperCase() + iconName.slice(1)
                      }
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
                    onClick={() => {
                      colorLocked.current = true;
                      setColor(hex === color ? '' : hex);
                    }}
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
                    onChange={(e) => {
                      colorLocked.current = true;
                      setColor(e.target.value);
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Custom project colour"
                  />
                </label>
                {color && (
                  <button
                    type="button"
                    onClick={() => {
                      colorLocked.current = true;
                      setColor('');
                    }}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Optional wiring, full-width and visually parked so the columns
            above stay calm. */}
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
          <div className="mb-3 flex items-center justify-between text-[11px]">
            <span className="font-medium text-muted-foreground">
              Hook it up
            </span>
            <span className="text-muted-foreground/70">
              Optional — skip freely
            </span>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-notebook">Linked notebook</Label>
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
              <Label htmlFor="project-repo">Repo path</Label>
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
                  className="h-8 shrink-0 gap-1.5 border-border/80 text-xs hover:bg-accent"
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || saving}
          >
            {saving
              ? editing
                ? 'Saving…'
                : 'Creating…'
              : editing
                ? 'Save'
                : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
