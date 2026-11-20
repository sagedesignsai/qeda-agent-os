/**
 * components/studio/inspector/sections/EffectsPalette.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Effects Palette: Categorized grid of studio effects available for drag-to-add
 * onto timeline clips (video and overlays).
 *
 * Features:
 * - Grouped by category (Light, Film, Retro)
 * - Drag-and-drop support
 * - Preview with accent color
 * - Collapsible accordion-style interface
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { ChevronDownIcon, SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioEffectType } from '@/lib/studio/types';
import {
  STUDIO_EFFECTS,
  type StudioEffectCategory,
  type StudioEffectDefinition,
} from '@/lib/studio/effects/catalog';
import { Button } from '@/components/ui/button';

export interface EffectsPaletteProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  onEffectDragStart?: (effectType: StudioEffectType, event: React.DragEvent) => void;
}

/**
 * Group effects by category for display
 */
function groupEffectsByCategory(): Map<StudioEffectCategory, StudioEffectDefinition[]> {
  const groups = new Map<StudioEffectCategory, StudioEffectDefinition[]>();

  for (const effect of STUDIO_EFFECTS) {
    if (!groups.has(effect.category)) {
      groups.set(effect.category, []);
    }
    groups.get(effect.category)!.push(effect);
  }

  return groups;
}

/**
 * Individual effect card for palette
 */
function EffectCard({
  effect,
  onDragStart,
}: {
  effect: StudioEffectDefinition;
  onDragStart?: (effectType: StudioEffectType, event: React.DragEvent) => void;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    // Set drag data with effect type
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-studio-effect', effect.type);

    // Set custom drag image with accent color
    const dragImage = document.createElement('div');
    dragImage.style.width = '32px';
    dragImage.style.height = '32px';
    dragImage.style.backgroundColor = effect.accent;
    dragImage.style.borderRadius = '4px';
    dragImage.style.opacity = '0.8';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 16, 16);
    setTimeout(() => document.body.removeChild(dragImage), 0);

    onDragStart?.(effect.type, e);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group relative p-2 bg-card/60 border border-border/40 rounded-md hover:bg-card hover:border-border/60 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm"
      title={effect.description}
    >
      {/* Accent color indicator */}
      <div
        className="w-full h-8 rounded-sm mb-1.5 border border-border/30"
        style={{ backgroundColor: `${effect.accent}20`, borderColor: effect.accent }}
      >
        <div
          className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: effect.accent }}
        >
          <SparklesIcon className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Effect label */}
      <h4 className="text-xs font-semibold text-foreground truncate">
        {effect.label}
      </h4>

      {/* Effect type badge */}
      <p className="text-[11px] text-muted-foreground truncate">
        {effect.type}
      </p>

      {/* Drag indicator */}
      <div className="absolute inset-0 rounded-md border-2 border-transparent group-active:border-primary/50 transition-colors pointer-events-none" />
    </div>
  );
}

/**
 * Main palette component
 */
export function EffectsPalette({
  isOpen: initialOpen = false,
  onToggle,
  onEffectDragStart,
}: EffectsPaletteProps) {
  const [isOpen, setIsOpen] = React.useState(initialOpen);
  const effectsByCategory = React.useMemo(() => groupEffectsByCategory(), []);

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    onToggle?.(newOpen);
  };

  return (
    <div className="border-t border-border/40 bg-background/30">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-background/50 transition-colors group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <SparklesIcon className="w-4 h-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">Effects Palette</h3>
        </div>
        <ChevronDownIcon
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform shrink-0',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-3 py-3 space-y-4 border-t border-border/20">
          {Array.from(effectsByCategory.entries()).map(([category, effects]) => (
            <div key={category}>
              {/* Category label */}
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h4>

              {/* Effects grid */}
              <div className="grid grid-cols-2 gap-2">
                {effects.map((effect) => (
                  <EffectCard
                    key={effect.type}
                    effect={effect}
                    onDragStart={onEffectDragStart}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Helper text */}
          <div className="text-[11px] text-muted-foreground bg-muted/20 border border-muted/40 rounded p-2 mt-3">
            💡 <strong>Tip:</strong> Drag an effect onto a video or overlay clip to add it.
          </div>
        </div>
      )}
    </div>
  );
}
