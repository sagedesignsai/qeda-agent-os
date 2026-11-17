/**
 * components/motion/MotionLookMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The look shelf: one click puts a complete, editable post stack in the scene.
 *
 * Presets are op batches (`lib/motion/look-presets.ts`), so applying one is
 * undoable and every resulting `fx.*` node is a normal scene node afterwards.
 * The menu also shows what is currently in the stack, which keeps "what look am
 * I looking at?" from being a guess.
 */

import { useState } from 'react';
import { ApertureIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { motionStore } from '@/hooks/use-motion-store';
import { createMotionId } from '@/lib/motion/ids';
import { describeLookStack, isMotionLookNode, resolveLookStack } from '@/lib/motion/look';
import { expandLookPreset, listLookPresets } from '@/lib/motion/look-presets';
import type { MotionDocument } from '@/lib/motion/types';

export function MotionLookMenu({ doc }: { doc: MotionDocument }) {
  const [open, setOpen] = useState(false);
  const activeScene =
    doc.scenes.find((scene) => scene.id === doc.activeSceneId) ?? doc.scenes[0];
  const lookNodes = activeScene.nodes.filter((node) => isMotionLookNode(node.type));
  const stack = resolveLookStack(activeScene, motionStore.clock.getTime());
  const summary = describeLookStack(stack);

  const applyPreset = (presetId: string, label: string) => {
    motionStore.commit(
      `Apply look: ${label}`,
      expandLookPreset(
        presetId,
        { existingLookNodeIds: lookNodes.map((node) => node.id) },
        createMotionId,
      ),
    );
    setOpen(false);
  };

  const clearLook = () => {
    if (lookNodes.length === 0) return;
    motionStore.commit(
      'Clear look',
      lookNodes.map((node) => ({ op: 'scene.node.remove' as const, nodeId: node.id })),
    );
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={lookNodes.length > 0 ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px]"
          aria-label="Choose a look"
          title={`Look — ${summary}`}
        >
          <ApertureIcon data-icon />
          <span className="hidden sm:inline">Look</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <div className="flex items-center justify-between px-1.5 pb-1.5 pt-1">
          <div className="min-w-0">
            <p className="text-[11px] font-medium">Look</p>
            <p className="truncate text-[10px] text-muted-foreground">{summary}</p>
          </div>
          {lookNodes.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground"
              onClick={clearLook}
            >
              <Trash2Icon className="size-3" />
              Clear
            </Button>
          )}
        </div>
        <div className="flex flex-col">
          {listLookPresets().map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id, preset.label)}
              className="flex flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="text-[11px] font-medium">{preset.label}</span>
              <span className="text-[10px] leading-snug text-muted-foreground">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
        <p className="px-2 pb-1 pt-2 text-[9px] leading-relaxed text-muted-foreground">
          A preset replaces the current look with editable FX nodes — no lock-in.
        </p>
      </PopoverContent>
    </Popover>
  );
}
