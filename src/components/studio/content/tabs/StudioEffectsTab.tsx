/**
 * components/studio/content/tabs/StudioEffectsTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Effects tab for the Studio Content Panel.
 *
 * The preset grid is *generated* from the domain catalogs
 * (`lib/studio/effects/*`) rather than hand-listed here, so adding a canvas
 * effect to the catalog makes it appear — and render — without touching the UI.
 *
 * Two families are offered side by side:
 *   - Kinetic Camera (zooms) → `payload.effectType === 'zoom'`
 *   - Canvas FX            → a real compositing pass keyed by `payload.effectType`
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  SearchIcon,
  SparklesIcon,
  ZoomInIcon,
  SunIcon,
  ApertureIcon,
  FilmIcon,
  ScanLineIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import type { StudioEffectType } from '@/lib/studio-types';
import { STUDIO_ZOOM_PRESETS } from '@/lib/studio/effects/zoom-presets';

interface StudioEffectsTabProps {
  onAddClip: (clip: ContentItemPayload) => void;
}

interface EffectPreset {
  id: string;
  title: string;
  category: string;
  durationMs: number;
  preview: ReactNode;
  itemData: ContentItemPayload;
}

const EFFECT_ICONS: Record<StudioEffectType, ReactNode> = {
  spotlight: <SunIcon className="w-6 h-6 text-amber-300" />,
  'neon-glow': <SparklesIcon className="w-6 h-6 text-indigo-300" />,
  vignette: <ApertureIcon className="w-6 h-6 text-slate-300" />,
  'film-grain': <FilmIcon className="w-6 h-6 text-stone-300" />,
  scanlines: <ScanLineIcon className="w-6 h-6 text-cyan-300" />,
};

function buildPresets(): EffectPreset[] {
  const zoomPresets: EffectPreset[] = STUDIO_ZOOM_PRESETS.map((preset) => ({
    id: preset.id,
    title: preset.label,
    category: 'Kinetic Camera',
    durationMs: preset.durationMs,
    preview: (
      <div className="flex flex-col items-center justify-center gap-1 text-purple-400">
        <ZoomInIcon className="w-6 h-6" />
        <span className="text-[10px] font-mono font-bold">
          {preset.scale.toFixed(1)}x
        </span>
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: preset.label,
      durationMs: preset.durationMs,
      color: preset.accent,
      payload: {
        effectType: 'zoom',
        scale: preset.scale,
        targetX: preset.targetX,
        targetY: preset.targetY,
      },
    },
  }));

  const canvasEffects: EffectPreset[] = STUDIO_EFFECTS.map((effect) => ({
    id: `fx-${effect.type}`,
    title: effect.label,
    category: effect.category,
    durationMs: effect.defaultDurationMs,
    preview: (
      <div className="flex flex-col items-center justify-center gap-1">
        {EFFECT_ICONS[effect.type]}
        <span className="text-[9px] font-mono font-bold text-muted-foreground">
          {Math.round(effect.defaultIntensity * 100)}%
        </span>
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: effect.label,
      durationMs: effect.defaultDurationMs,
      color: effect.accent,
      payload: {
        effectType: effect.type,
        intensity: effect.defaultIntensity,
      },
    },
  }));

  return [...zoomPresets, ...canvasEffects];
}

const PRESETS = buildPresets();

export function StudioEffectsTab({ onAddClip }: StudioEffectsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.toLowerCase();
  const filtered = PRESETS.filter(
    (preset) =>
      preset.title.toLowerCase().includes(query) ||
      preset.category.toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-col h-full gap-3 overflow-y-auto overflow-x-hidden pr-1">
      {/* Search Bar */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search effects & zooms..."
          className="h-8 pl-8 text-xs bg-secondary/30 border-border/40 focus-visible:ring-1"
        />
      </div>

      {/* Grid of Effect Presets */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((preset) => (
          <ContentCardItem
            key={preset.id}
            id={preset.id}
            title={preset.title}
            subtitle={preset.category}
            badge={`${(preset.durationMs / 1000).toFixed(0)}s`}
            previewNode={preset.preview}
            itemData={preset.itemData}
            onAdd={onAddClip}
          />
        ))}
      </div>
    </div>
  );
}
