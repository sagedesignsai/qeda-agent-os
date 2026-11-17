/**
 * components/motion/MotionSceneSelector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The canonical scene switcher. Scenes are timeline scopes — each one owns its
 * own tracks, clips and duration — so the selector lives on the timeline header
 * next to the transport rather than on the preview.
 *
 * The menu shows the whole document at a glance (index, name, duration), then
 * the management actions that used to be spread across the top bar and the tab
 * strip. `Alt+[` / `Alt+]` cycle scenes without opening the menu.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { buildMotionSceneCreation } from '@/lib/motion/scene-create';
import { cn } from '@/lib/utils';

/** Search is only worth the row once the list stops fitting in one glance. */
const SEARCH_THRESHOLD = 8;

export function MotionSceneSelector({ className }: { className?: string }) {
  const { doc } = useMotionSnapshot();
  const [open, setOpen] = useState(false);

  const scenes = doc.scenes;
  const activeIndex = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === doc.activeSceneId),
  );
  const activeScene = scenes[activeIndex];

  const switchScene = useCallback((sceneId: string) => {
    setOpen(false);
    if (sceneId === motionStore.getDocument().activeSceneId) return;
    motionStore.commit('Switch scene', [
      { op: 'document.setActiveScene', sceneId },
    ]);
  }, []);

  const createScene = useCallback((duplicate: boolean) => {
    const creation = buildMotionSceneCreation(
      motionStore.getDocument(),
      duplicate,
    );
    motionStore.commit(creation.label, [creation.op]);
    setOpen(false);
  }, []);

  const renameScene = useCallback(() => {
    const scene = motionStore
      .getDocument()
      .scenes.find((candidate) => candidate.id === doc.activeSceneId);
    if (!scene) return;
    const next = window.prompt('Rename scene', scene.name);
    const name = next?.trim();
    setOpen(false);
    if (!name || name === scene.name) return;
    motionStore.commit('Rename scene', [
      { op: 'scene.rename', sceneId: scene.id, name },
    ]);
  }, [doc.activeSceneId]);

  const deleteScene = useCallback(() => {
    const current = motionStore.getDocument();
    const scene = current.scenes.find(
      (candidate) => candidate.id === current.activeSceneId,
    );
    if (!scene || current.scenes.length <= 1) return;
    const confirmation = window.prompt(
      `Delete "${scene.name}" (${scene.timeline.duration.toFixed(1)}s)? Type the scene name to confirm.`,
    );
    setOpen(false);
    if (confirmation !== scene.name) return;
    motionStore.commit(
      'Delete scene',
      [{ op: 'scene.remove', sceneId: scene.id }],
      { approved: true },
    );
  }, []);

  // Alt+[ / Alt+] cycles scenes — the keyboard path that tab strips used to give.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key !== '[' && event.key !== ']') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      const current = motionStore.getDocument();
      if (current.scenes.length <= 1) return;
      event.preventDefault();
      const currentIndex = Math.max(
        0,
        current.scenes.findIndex((scene) => scene.id === current.activeSceneId),
      );
      const delta = event.key === ']' ? 1 : -1;
      const next =
        (currentIndex + delta + current.scenes.length) % current.scenes.length;
      switchScene(current.scenes[next].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [switchScene]);

  if (!activeScene) return null;

  const sceneCount = scenes.length;
  const durationLabel = `${activeScene.timeline.duration.toFixed(1)}s`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 max-w-60 justify-start gap-1.5 px-1.5 text-[11px]',
            className,
          )}
          aria-label={`Scene selector — ${activeScene.name}`}
          title={`Scene ${activeIndex + 1} of ${sceneCount} · ${durationLabel} (Alt+[ / Alt+])`}
        >
          <ClapperboardIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">
            {activeScene.name}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {activeIndex + 1}/{sceneCount} · {durationLabel}
          </span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <Command>
          {sceneCount > SEARCH_THRESHOLD && (
            <CommandInput placeholder="Search scenes..." />
          )}
          <CommandList>
            <CommandEmpty>No scenes found.</CommandEmpty>
            <CommandGroup heading="Scenes">
              {scenes.map((scene, index) => {
                const active = scene.id === doc.activeSceneId;
                return (
                  <CommandItem
                    key={scene.id}
                    value={`${scene.name} ${index + 1}`}
                    onSelect={() => switchScene(scene.id)}
                    className="text-[11px]"
                  >
                    <ClapperboardIcon
                      className={cn(
                        'size-3.5',
                        active ? 'text-primary' : 'text-muted-foreground/70',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {scene.name}
                    </span>
                    <span
                      data-slot="command-shortcut"
                      className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                    >
                      {index + 1} · {scene.timeline.duration.toFixed(1)}s
                    </span>
                    {active && (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Manage">
              <CommandItem
                onSelect={() => createScene(false)}
                className="text-[11px]"
              >
                <PlusIcon className="size-3.5" />
                New scene
              </CommandItem>
              <CommandItem
                onSelect={() => createScene(true)}
                className="text-[11px]"
              >
                <CopyIcon className="size-3.5" />
                Duplicate scene
              </CommandItem>
              <CommandItem onSelect={renameScene} className="text-[11px]">
                <PencilIcon className="size-3.5" />
                Rename scene
              </CommandItem>
              <CommandItem
                onSelect={deleteScene}
                disabled={sceneCount <= 1}
                className="text-[11px] text-destructive data-[disabled=true]:text-destructive/50"
              >
                <Trash2Icon className="size-3.5" />
                Delete scene...
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center justify-between border-t border-border/60 px-2 py-1 text-[9px] text-muted-foreground">
          <span>Scenes are independent timelines</span>
          <span className="tabular-nums">Alt+[ / Alt+]</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
