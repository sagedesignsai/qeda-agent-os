/**
 * components/studio/scenes/StudioSceneSelector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene scope switcher for the Studio timeline.
 *
 * Scenes are timeline scopes, so the selector lives next to the transport, not
 * on the canvas. The menu carries the full project at a glance plus the scene
 * management actions. Alt+[ / Alt+] cycles scenes without opening the menu.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StudioScene } from '@/lib/studio/types';
import { cn } from '@/lib/utils';

export interface StudioSceneSelectorProps {
  scenes: StudioScene[];
  activeSceneId?: string;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
  onDuplicateScene: () => void;
  onRenameScene: () => void;
  onDeleteScene: () => void;
  onExportScene: () => void;
  className?: string;
}

function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export function StudioSceneSelector({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDuplicateScene,
  onRenameScene,
  onDeleteScene,
  onExportScene,
  className,
}: StudioSceneSelectorProps) {
  const [open, setOpen] = useState(false);
  const activeIndex = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === activeSceneId),
  );
  const activeScene = scenes[activeIndex] ?? scenes[0];

  const selectScene = useCallback(
    (sceneId: string) => {
      setOpen(false);
      if (sceneId !== (activeSceneId ?? scenes[0]?.id)) {
        onSelectScene(sceneId);
      }
    },
    [activeSceneId, onSelectScene, scenes],
  );

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
      if (scenes.length <= 1) return;
      event.preventDefault();
      const delta = event.key === ']' ? 1 : -1;
      const next =
        (activeIndex + delta + scenes.length) % scenes.length;
      onSelectScene(scenes[next].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, onSelectScene, scenes]);

  if (!activeScene) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 min-w-0 gap-1 rounded px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                open && 'bg-secondary/60 text-foreground',
                className,
              )}
              aria-label={`Scene ${activeIndex + 1}: ${activeScene.name}. Switch scene`}
            >
              <ClapperboardIcon className="size-3 shrink-0 text-primary" />
              <span className="shrink-0 tabular-nums text-foreground">
                {activeIndex + 1}
              </span>
              <span className="max-w-28 truncate">{activeScene.name}</span>
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Scene {activeIndex + 1} of {scenes.length} · Alt+[ / Alt+]
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" side="top" className="w-72 p-0">
        <Command>
          <CommandList>
            <CommandGroup heading={`Scenes (${scenes.length})`}>
              {scenes.map((scene, index) => {
                const active = scene.id === activeScene.id;
                return (
                  <CommandItem
                    key={scene.id}
                    value={`${index + 1} ${scene.name}`}
                    onSelect={() => selectScene(scene.id)}
                    className="cursor-pointer gap-2"
                  >
                    <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{scene.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatSeconds(scene.durationMs)}
                    </span>
                    {active && (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Scene">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onAddScene();
                }}
                className="cursor-pointer gap-2"
              >
                <PlusIcon className="size-3.5" />
                <span>New scene…</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onDuplicateScene();
                }}
                className="cursor-pointer gap-2"
              >
                <CopyIcon className="size-3.5" />
                <span>Duplicate current</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onRenameScene();
                }}
                className="cursor-pointer gap-2"
              >
                <PencilIcon className="size-3.5" />
                <span>Rename scene…</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onExportScene();
                }}
                className="cursor-pointer gap-2"
              >
                <DownloadIcon className="size-3.5" />
                <span>Export this scene…</span>
              </CommandItem>
              <CommandItem
                disabled={scenes.length <= 1}
                onSelect={() => {
                  if (scenes.length <= 1) return;
                  setOpen(false);
                  onDeleteScene();
                }}
                className="cursor-pointer gap-2 text-destructive data-[disabled=true]:opacity-40"
              >
                <Trash2Icon className="size-3.5" />
                <span>Delete scene…</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}