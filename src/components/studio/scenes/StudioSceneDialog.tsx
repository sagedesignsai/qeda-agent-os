/**
 * components/studio/scenes/StudioSceneDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Create or rename a scene. Creation offers the small set of starter templates
 * that used to live behind the global Motion Cards toggle: Intro, Outro,
 * Comparison and a blank canvas.
 */

import { useEffect, useState } from 'react';
import {
  Columns2Icon,
  FilePlus2Icon,
  MonitorPlayIcon,
  SparklesIcon,
  TypeIcon,
} from 'lucide-react';

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
import {
  STUDIO_SCENE_TEMPLATES,
  type StudioSceneTemplateId,
} from '@/lib/studio/scenes';
import { cn } from '@/lib/utils';

export type StudioSceneDialogMode = 'add' | 'rename';

export interface StudioSceneDialogProps {
  open: boolean;
  mode: StudioSceneDialogMode;
  initialName?: string;
  sceneCount: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, templateId?: StudioSceneTemplateId) => void;
}

const TEMPLATE_ICONS: Record<StudioSceneTemplateId, typeof TypeIcon> = {
  blank: FilePlus2Icon,
  intro: MonitorPlayIcon,
  outro: SparklesIcon,
  comparison: Columns2Icon,
};

export function StudioSceneDialog({
  open,
  mode,
  initialName = '',
  sceneCount,
  onOpenChange,
  onSubmit,
}: StudioSceneDialogProps) {
  const [name, setName] = useState(initialName);
  const [templateId, setTemplateId] =
    useState<StudioSceneTemplateId>('blank');

  useEffect(() => {
    if (open) {
      setName(initialName);
      setTemplateId('blank');
    }
  }, [open, initialName]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, mode === 'add' ? templateId : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add scene' : 'Rename scene'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? `Scene ${sceneCount + 1} becomes an independent timeline scope inside this project.`
              : 'The scene name appears in the story strip and scene switcher.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="studio-scene-name"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Name
            </label>
            <Input
              id="studio-scene-name"
              value={name}
              autoFocus
              maxLength={80}
              placeholder="Scene name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          {mode === 'add' && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Start from
              </span>
              <div className="grid grid-cols-2 gap-2">
                {STUDIO_SCENE_TEMPLATES.map((template) => {
                  const Icon = TEMPLATE_ICONS[template.id];
                  const active = templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTemplateId(template.id)}
                      className={cn(
                        'flex min-h-20 flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors',
                        active
                          ? 'border-primary/70 bg-primary/10'
                          : 'border-border/60 hover:border-border hover:bg-muted/30',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4',
                          active ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                      <span className="text-xs font-medium">
                        {template.title}
                      </span>
                      <span className="text-[10px] leading-tight text-muted-foreground">
                        {template.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {mode === 'add' ? 'Add scene' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}