import { useState } from 'react';
import {
  Layers3Icon,
  MonitorSmartphoneIcon,
  PanelsTopLeftIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import type {
  StudioCompositionTemplateSummary,
  StudioCompositionSceneId,
  StudioTakeSummary,
} from '@/lib/studio/types';

const SCENES: Array<{
  id: StudioCompositionSceneId;
  title: string;
  description: string;
  takes: number;
}> = [
  {
    id: 'app-spotlight',
    title: 'App spotlight',
    description: 'One recording fills the canvas.',
    takes: 1,
  },
  {
    id: 'desktop-mobile-comparison',
    title: 'Desktop + mobile',
    description: 'Compare two recordings side by side or stacked.',
    takes: 2,
  },
];

function SceneThumbnail({
  sceneId,
  compact = false,
}: {
  sceneId: StudioCompositionSceneId;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative flex ${
        compact ? 'h-14 w-20 shrink-0' : 'h-16 w-full'
      } items-center justify-center overflow-hidden rounded-md border border-border/70 bg-[#101318]`}
      aria-hidden="true"
    >
      {sceneId === 'app-spotlight' ? (
        <div
          className={`${compact ? 'h-9' : 'h-11'} w-4/5 rounded border border-primary/70 bg-primary/10`}
        />
      ) : (
        <div
          className={`flex ${compact ? 'h-9' : 'h-11'} w-4/5 items-center gap-1`}
        >
          <div className="h-full w-2/3 rounded border border-primary/70 bg-primary/10" />
          <div className="h-4/5 w-1/4 rounded border border-sky-400/70 bg-sky-400/10" />
        </div>
      )}
    </div>
  );
}

export function StudioCompositionCreateDialog({
  open,
  takes,
  templates,
  onOpenChange,
  onCreate,
  onDeleteTemplate,
}: {
  open: boolean;
  takes: StudioTakeSummary[];
  templates: StudioCompositionTemplateSummary[];
  onOpenChange: (open: boolean) => void;
  onCreate: (
    sceneId: StudioCompositionSceneId,
    title: string,
    sourceTakeIds: string[],
    templateId?: string,
  ) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'scene' | 'template'>('scene');
  const [sceneId, setSceneId] =
    useState<StudioCompositionSceneId>('app-spotlight');
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('App spotlight');
  const [sourceTakeIds, setSourceTakeIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [templatePendingDelete, setTemplatePendingDelete] =
    useState<StudioCompositionTemplateSummary | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);

  const selectedTemplate =
    templates.find((template) => template.id === templateId) ?? null;
  const scene = SCENES.find((option) => option.id === sceneId) ?? SCENES[0];
  const requiredTakes =
    mode === 'template'
      ? selectedTemplate?.videoLayers ?? []
      : Array.from({ length: scene.takes }, (_, index) => ({
          id: String(index),
          name:
            scene.takes === 1
              ? 'Recording'
              : index === 0
                ? 'Desktop recording'
                : 'Mobile recording',
        }));
  const selectedTakeIds = requiredTakes.map(
    (_, index) => sourceTakeIds[index] ?? takes[index]?.id ?? '',
  );
  const canCreate =
    (mode === 'scene' || !!selectedTemplate) &&
    new Set(selectedTakeIds.filter(Boolean)).size ===
      selectedTakeIds.filter(Boolean).length &&
    !!title.trim();

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const takeIds = selectedTakeIds.filter(Boolean);
      await onCreate(
        mode === 'template' ? selectedTemplate!.sceneId : sceneId,
        title.trim(),
        takeIds.length > 0 ? takeIds : [],
        mode === 'template' ? selectedTemplate!.id : undefined,
      );
      onOpenChange(false);
    } catch (error) {
      console.error('[Studio] Composition creation failed.', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers3Icon className="size-4 text-primary" />
            Start with a scene or template
          </DialogTitle>
          <DialogDescription>
            Use a guided layout or reuse a saved arrangement. You can refine it
            after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border/50 pb-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'scene' ? 'secondary' : 'ghost'}
            onClick={() => setMode('scene')}
          >
            Guided scenes
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'template' ? 'secondary' : 'ghost'}
            disabled={!templates.length}
            onClick={() => {
              setMode('template');
              const first = templates[0];
              if (!templateId && first) {
                setTemplateId(first.id);
                setTitle(`${first.title} copy`);
                setSourceTakeIds([]);
              }
            }}
          >
            Saved templates ({templates.length})
          </Button>
        </div>

        {mode === 'scene' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {SCENES.map((option) => {
              const selected = sceneId === option.id;
              const Icon =
                option.id === 'app-spotlight'
                  ? PanelsTopLeftIcon
                  : MonitorSmartphoneIcon;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSceneId(option.id);
                    setTitle(
                      option.id === 'app-spotlight'
                        ? 'App spotlight'
                        : 'Desktop + mobile comparison',
                    );
                    setSourceTakeIds([]);
                  }}
                  className={`rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? 'border-primary/70 bg-primary/5'
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  <SceneThumbnail sceneId={option.id} />
                  <div className="mt-3 flex items-start gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="studio-composition-template"
              className="space-y-1.5 text-xs font-medium"
            >
              Saved arrangement
              <select
                id="studio-composition-template"
                aria-label="Saved arrangement"
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedTemplate?.id ?? ''}
                onChange={(event) => {
                  const next = templates.find(
                    (template) => template.id === event.target.value,
                  );
                  if (!next) return;
                  setTemplateId(next.id);
                  setTitle(`${next.title} copy`);
                  setSourceTakeIds([]);
                }}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title} · {template.aspectRatio}
                  </option>
                ))}
              </select>
            </label>
            {selectedTemplate && (
              <div className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/20 p-3">
                <SceneThumbnail
                  sceneId={selectedTemplate.sceneId}
                  compact
                />
                <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {selectedTemplate.sceneId === 'desktop-mobile-comparison'
                      ? 'Desktop + mobile'
                      : 'App spotlight'}{' '}
                    · {selectedTemplate.aspectRatio}
                  </p>
                  {selectedTemplate.videoLayers.map((layer) => (
                    <p key={layer.id} className="truncate">
                      Recording · {layer.name}
                    </p>
                  ))}
                  <p>
                    {selectedTemplate.imageLayerCount} image
                    {selectedTemplate.imageLayerCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete template ${selectedTemplate.title}`}
                  disabled={creating || deletingTemplate}
                  onClick={() => setTemplatePendingDelete(selectedTemplate)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label
            htmlFor="studio-composition-title"
            className="space-y-1.5 text-xs font-medium"
          >
            Composition name
            <Input
              id="studio-composition-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Name this composition"
            />
          </label>
          {requiredTakes.map((videoLayer, index) => (
            <label
              key={videoLayer.id}
              htmlFor={`studio-composition-take-${index}`}
              className="space-y-1.5 text-xs font-medium"
            >
              {videoLayer.name}
              <select
                id={`studio-composition-take-${index}`}
                aria-label={videoLayer.name}
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedTakeIds[index] ?? ''}
                onChange={(event) =>
                  setSourceTakeIds((current) => {
                    const next = [...current];
                    next[index] = event.target.value;
                    return next;
                  })
                }
              >
                <option value="">Choose a take…</option>
                {takes
                  .filter(
                    (take) =>
                      !selectedTakeIds.some(
                        (id, selectedIndex) =>
                          selectedIndex !== index && id === take.id,
                      ),
                  )
                  .map((take) => (
                    <option key={take.id} value={take.id}>
                      {take.title}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>

        {takes.length === 0 && (
          <p className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
            You can add recordings as layers after creating the composition.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canCreate || creating}
          >
            {creating ? 'Creating…' : 'Create composition'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog
        open={!!templatePendingDelete}
        onOpenChange={(open) => {
          if (!open && !deletingTemplate) setTemplatePendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved template?</AlertDialogTitle>
            <AlertDialogDescription>
              “{templatePendingDelete?.title}” will be removed. Compositions
              already created from this template will not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTemplate}>
              Keep template
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingTemplate}
              onClick={async (event) => {
                if (!templatePendingDelete) return;
                event.preventDefault();
                setDeletingTemplate(true);
                try {
                  const deleted = await onDeleteTemplate(
                    templatePendingDelete.id,
                  );
                  if (deleted) {
                    if (templateId === templatePendingDelete.id) {
                      setTemplateId('');
                      setSourceTakeIds([]);
                    }
                    setTemplatePendingDelete(null);
                  }
                } finally {
                  setDeletingTemplate(false);
                }
              }}
            >
              {deletingTemplate ? 'Deleting…' : 'Delete template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
