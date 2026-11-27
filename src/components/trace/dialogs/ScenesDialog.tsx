/**
 * components/trace/dialogs/ScenesDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Storyboard scene configuration.
 *
 * Scenes are a contiguous partition of the same timeline: reordering or changing
 * a duration re-lays every `startMs` from zero, and an entrance is a frame-level
 * veil (`cut` / `fade` / `slide`) painted over the composition rather than an
 * element animation. Everything here goes through semantic ops, so scene edits
 * are undoable like any other document change.
 *
 * Delete is two-step because removing a scene also removes the layers assigned to
 * it — the confirmation names the layer count before anything is pruned.
 */

import { useEffect, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClapperboardIcon,
  PlusIcon,
  Trash2Icon,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorField } from '@/components/trace/inspector/fields';
import { ScrubField } from '@/components/trace/inspector/scrub-field';
import { DEFAULT_SCENE_BACKGROUND } from '@/lib/trace/runtime/scenes';
import { formatTraceTimecode } from '@/lib/trace/runtime/resolve-element';
import type { SceneTransition } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

export type ScenesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TRANSITIONS: Array<{
  value: SceneTransition;
  label: string;
  hint: string;
}> = [
  { value: 'cut', label: 'Cut', hint: 'Hard cut — the next scene appears instantly.' },
  {
    value: 'fade',
    label: 'Fade',
    hint: 'Dips from the scene background over 450ms.',
  },
  {
    value: 'slide',
    label: 'Slide',
    hint: 'A background-coloured panel wipes off to the right over 450ms.',
  },
];

export function ScenesDialog({ open, onOpenChange }: ScenesDialogProps) {
  const project = useTraceStore((state) => state.project);
  const activeSceneId = useTraceStore(
    (state) => state.selection.activeSceneId,
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const scenes = project?.storyboard?.scenes ?? [];
  const active =
    scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0] ?? null;
  const activeIndex = active
    ? scenes.findIndex((scene) => scene.id === active.id)
    : -1;

  useEffect(() => {
    if (!open) setConfirmId(null);
  }, [open]);

  // Keep the active scene valid when the document loads scenes without one.
  useEffect(() => {
    if (!open) return;
    const first = scenes[0]?.id;
    if (!first) return;
    const valid =
      activeSceneId && scenes.some((scene) => scene.id === activeSceneId);
    if (!valid) useTraceStore.getState().setActiveScene(first);
  }, [open, activeSceneId, scenes]);

  if (!project) return null;

  const store = useTraceStore.getState;
  const sceneLayers = (sceneId: string) =>
    Object.values(project.elements).filter(
      (element) => element.sceneId === sceneId,
    ).length;

  const addScene = () => {
    store().addScene({
      name: `Scene ${scenes.length + 1}`,
      durationMs: 1500,
      transitionIn: 'cut',
      ...(active ? { afterSceneId: active.id } : {}),
    });
    setConfirmId(null);
  };

  const focus = (sceneId: string) => {
    store().focusScene(sceneId);
    setConfirmId(null);
  };

  const update = (
    patch: Parameters<ReturnType<typeof store>['updateScene']>[1],
  ) => {
    if (!active) return;
    store().updateScene(active.id, patch);
  };

  const move = (delta: number) => {
    if (!active || activeIndex < 0) return;
    store().reorderScene(active.id, activeIndex + delta);
  };

  const remove = () => {
    if (!active) return;
    if (confirmId !== active.id) {
      setConfirmId(active.id);
      return;
    }
    store().removeScene(active.id);
    setConfirmId(null);
  };

  const transition = active?.transitionIn ?? 'cut';
  const transitionInfo =
    TRANSITIONS.find((entry) => entry.value === transition) ?? TRANSITIONS[0];
  const customBackground = Boolean(active?.background);
  const sceneDuration = scenes.reduce(
    (total, scene) => total + scene.durationMs,
    0,
  );
  const canvasDiffers = Math.abs(sceneDuration - project.durationMs) >= 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-foreground sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ClapperboardIcon className="size-4 text-sky-300" />
            Scenes
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Scenes partition the timeline. A scene entrance is a veil over the
            finished frame, so it never fights the animation inside the scene.
          </DialogDescription>
        </DialogHeader>

        {scenes.length === 0 || !active ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border/60 bg-background/30 px-4 py-10 text-center">
            <p className="text-[11px] text-muted-foreground">
              This composition has no scenes yet. Add one to plan the cut and
              give each beat its own background and entrance.
            </p>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={addScene}
            >
              <PlusIcon className="size-3.5" /> Add scene
            </Button>
          </div>
        ) : (
          <div className="grid min-h-0 grid-cols-[196px_minmax(0,1fr)] gap-3">
            {/* Scene list */}
            <div className="flex min-h-0 flex-col gap-2">
              <ScrollArea className="h-80 rounded-md border border-border/60 bg-background/30">
                <div className="flex flex-col p-1">
                  {scenes.map((scene, index) => {
                    const selected = scene.id === active.id;
                    const layers = sceneLayers(scene.id);
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => focus(scene.id)}
                        className={cn(
                          'flex flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors',
                          selected
                            ? 'bg-sky-500/15 text-sky-100'
                            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[9px] text-muted-foreground/70">
                            {index + 1}
                          </span>
                          <span className="truncate text-[11px] font-medium">
                            {scene.name}
                          </span>
                        </span>
                        <span className="pl-4 font-mono text-[9px] text-muted-foreground/70">
                          {formatTraceTimecode(scene.startMs)} ·{' '}
                          {(scene.durationMs / 1000).toFixed(2)}s ·{' '}
                          {layers} layer{layers === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 justify-start gap-1 px-2 text-[11px]"
                onClick={addScene}
              >
                <PlusIcon className="size-3.5" /> Add scene
              </Button>
            </div>

            {/* Scene editor */}
            <div className="flex min-h-0 flex-col gap-3 rounded-md border border-border/60 bg-background/30 p-3">
              <div className="flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    Scene name
                  </span>
                  <Input
                    key={active.id}
                    defaultValue={active.name}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== active.name) {
                        update({ name: next });
                      } else if (!next) {
                        event.target.value = active.name;
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                    className="h-7 text-[11px]"
                  />
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => move(-1)}
                    disabled={activeIndex <= 0}
                    title="Move scene earlier"
                    aria-label="Move scene earlier"
                  >
                    <ArrowUpIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => move(1)}
                    disabled={activeIndex >= scenes.length - 1}
                    title="Move scene later"
                    aria-label="Move scene later"
                  >
                    <ArrowDownIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={remove}
                    title={
                      confirmId === active.id
                        ? 'Confirm: delete this scene and its layers'
                        : 'Delete scene'
                    }
                    aria-label="Delete scene"
                    className={cn(
                      'text-muted-foreground/70',
                      confirmId === active.id
                        ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                        : 'hover:bg-rose-500/10 hover:text-rose-300',
                    )}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </div>

              {confirmId === active.id ? (
                <div className="flex items-center justify-between gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5">
                  <p className="text-[10px] leading-snug text-rose-200">
                    Delete “{active.name}” and {sceneLayers(active.id)} layer
                    {sceneLayers(active.id) === 1 ? '' : 's'}?
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-[10px]"
                      onClick={remove}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    Duration
                  </span>
                  <ScrubField
                    label="Scene duration"
                    suffix="ms"
                    value={active.durationMs}
                    min={100}
                    max={600000}
                    step={50}
                    onChange={(durationMs) => update({ durationMs })}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    Entrance
                  </span>
                  <Select
                    value={transition}
                    onValueChange={(value) =>
                      update({ transitionIn: value as SceneTransition })
                    }
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSITIONS.map((entry) => (
                        <SelectItem
                          key={entry.value}
                          value={entry.value}
                          className="text-[11px]"
                        >
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="-mt-1.5 text-[10px] leading-snug text-muted-foreground/60">
                {transitionInfo.hint}
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={customBackground}
                    onChange={(event) =>
                      update({
                        background: event.target.checked
                          ? DEFAULT_SCENE_BACKGROUND
                          : null,
                      })
                    }
                  />
                  Custom scene background
                </label>
                {customBackground ? (
                  <ColorField
                    label="Scene background"
                    value={active.background ?? DEFAULT_SCENE_BACKGROUND}
                    onChange={(background) => update({ background })}
                  />
                ) : (
                  <p className="text-[10px] leading-snug text-muted-foreground/60">
                    Inherits the project background.
                  </p>
                )}
              </div>

              <label className="flex min-h-0 flex-1 flex-col gap-1">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  Director note
                </span>
                <textarea
                  key={active.id}
                  defaultValue={active.intent ?? ''}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== (active.intent ?? '')) {
                      update({ intent: next || null });
                    }
                  }}
                  rows={3}
                  placeholder="What happens in this scene, and how should it feel?"
                  className="min-h-16 w-full resize-y rounded-md border border-input bg-muted/20 px-2 py-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </label>

              <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
                <span className="font-mono">
                  {formatTraceTimecode(active.startMs)} →{' '}
                  {formatTraceTimecode(active.startMs + active.durationMs)}
                </span>
                <div className="flex items-center gap-2">
                  {canvasDiffers ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() =>
                        store().setCanvas({ durationMs: sceneDuration })
                      }
                      title="Set the canvas duration to the total scene length"
                    >
                      Fit canvas to {formatTraceTimecode(sceneDuration)}
                    </Button>
                  ) : null}
                  <span>
                    {scenes.length} scene{scenes.length === 1 ? '' : 's'} ·{' '}
                    {(project.durationMs / 1000).toFixed(2)}s canvas
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}