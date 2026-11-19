/**
 * components/studio/ShowcaseProjectDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dialog for creating a new Showcase project or editing an existing one.
 *
 *   - "New" mode: choose how to start — screen record, import video, or blank
 *   - "Edit" mode: edit title and description of an existing take
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import {
  VideoIcon,
  Loader2Icon,
  MonitorIcon,
  FileVideoIcon,
  PlusIcon,
} from 'lucide-react';
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
import type { StudioTakeSummary } from '@/lib/studio-types';

export type ShowcaseProjectDialogMode = 'new' | 'edit';
export type ShowcaseProjectSourceType = 'screen-record' | 'import-video' | 'blank';

export interface ShowcaseProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ShowcaseProjectDialogMode;
  /** The take being edited (only for "edit" mode). */
  editingTake?: StudioTakeSummary | null;
  /** Create a new project with the given title and source type. */
  onCreate: (title: string, sourceType: ShowcaseProjectSourceType) => Promise<void>;
  /** Update metadata for an existing take. */
  onEdit: (id: string, title: string, description: string | null) => Promise<void>;
}

export function ShowcaseProjectDialog({
  open,
  onOpenChange,
  mode,
  editingTake,
  onCreate,
  onEdit,
}: ShowcaseProjectDialogProps) {
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] =
    useState<ShowcaseProjectSourceType>('screen-record');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isEdit && editingTake) {
      setTitle(editingTake.title);
      setDescription(editingTake.description ?? '');
    } else {
      setTitle('');
      setDescription('');
      setSourceType('screen-record');
    }
  }, [open, isEdit, editingTake]);

  // Focus title field when dialog opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      titleRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      if (isEdit && editingTake) {
        await onEdit(editingTake.id, trimmedTitle, description.trim() || null);
      } else {
        await onCreate(trimmedTitle, sourceType);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSave();
    }
  };

  if (isEdit && editingTake) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                <VideoIcon className="w-4 h-4" />
              </div>
              <DialogTitle>Edit Project</DialogTitle>
            </div>
            <DialogDescription>
              Update the title and description for this project.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-title">Title</Label>
              <Input
                ref={titleRef}
                id="project-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My showcase project…"
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description…"
                rows={3}
                disabled={saving}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving && <Loader2Icon className="size-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <VideoIcon className="w-4 h-4" />
            </div>
            <DialogTitle>New Showcase Project</DialogTitle>
          </div>
          <DialogDescription>
            Choose how you want to start your project.
          </DialogDescription>
        </DialogHeader>

        {/* Title field */}
        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="project-title">Title</Label>
          <Input
            ref={titleRef}
            id="project-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My showcase project…"
            disabled={saving}
          />
        </div>

        {/* Source type selection */}
        <div className="flex flex-col gap-2">
          <Label>How do you want to start?</Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSourceType('screen-record')}
              className={`group flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                sourceType === 'screen-record'
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                  : 'border-border/50 hover:border-border hover:bg-secondary/40'
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  sourceType === 'screen-record'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary/60 text-muted-foreground group-hover:text-foreground'
                }`}
              >
                <MonitorIcon className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium">Screen Record</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Record your screen or window
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('import-video')}
              className={`group flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                sourceType === 'import-video'
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                  : 'border-border/50 hover:border-border hover:bg-secondary/40'
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  sourceType === 'import-video'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary/60 text-muted-foreground group-hover:text-foreground'
                }`}
              >
                <FileVideoIcon className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium">Import Video</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Use an existing video file
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('blank')}
              className={`group flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                sourceType === 'blank'
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                  : 'border-border/50 hover:border-border hover:bg-secondary/40'
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  sourceType === 'blank'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary/60 text-muted-foreground group-hover:text-foreground'
                }`}
              >
                <PlusIcon className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium">Blank</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Start from scratch
              </span>
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving && <Loader2Icon className="size-3.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
