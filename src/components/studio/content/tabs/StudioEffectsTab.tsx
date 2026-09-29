/**
 * components/studio/content/tabs/StudioEffectsTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual FX and Kinetic Zoom Presets Tab for Studio Content Panel:
 *   - Kinetic camera zooms (1.5x, 2.0x, Pan Left, Pan Right)
 *   - Visual filters (Spotlight, Ambient Neon Glow, Film Grain, Vignette, Blur)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  SearchIcon,
  SparklesIcon,
  ZoomInIcon,
  SunIcon,
  EyeIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';

interface StudioEffectsTabProps {
  onAddClip: (clip: ContentItemPayload) => void;
}

interface EffectPreset {
  id: string;
  title: string;
  category: string;
  durationMs: number;
  preview: React.ReactNode;
  itemData: ContentItemPayload;
}

const EFFECT_PRESETS: EffectPreset[] = [
  {
    id: 'fx-zoom-15',
    title: '1.5x Focus Zoom',
    category: 'Kinetic Camera',
    durationMs: 2500,
    preview: (
      <div className="flex flex-col items-center justify-center gap-1 text-purple-400">
        <ZoomInIcon className="w-6 h-6 animate-pulse" />
        <span className="text-[10px] font-mono font-bold">1.5x Scale</span>
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: '1.5x Focus Zoom',
      durationMs: 2500,
      color: '#8b5cf6',
      payload: {
        scale: 1.5,
        targetX: 0.5,
        targetY: 0.5,
        effectType: 'zoom',
      },
    },
  },
  {
    id: 'fx-zoom-20',
    title: '2.0x Macro Punch-in',
    category: 'Kinetic Camera',
    durationMs: 2000,
    preview: (
      <div className="flex flex-col items-center justify-center gap-1 text-indigo-400">
        <SparklesIcon className="w-6 h-6" />
        <span className="text-[10px] font-mono font-bold">2.0x Macro</span>
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: '2.0x Macro Punch',
      durationMs: 2000,
      color: '#7c3aed',
      payload: {
        scale: 2.0,
        targetX: 0.5,
        targetY: 0.5,
        effectType: 'zoom',
      },
    },
  },
  {
    id: 'fx-spotlight',
    title: 'Spotlight Focus',
    category: 'Canvas FX',
    durationMs: 3000,
    preview: (
      <div className="w-12 h-12 rounded-full bg-radial from-white/30 to-transparent flex items-center justify-center">
        <SunIcon className="w-5 h-5 text-amber-300" />
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: 'Spotlight Focus',
      durationMs: 3000,
      color: '#d97706',
      payload: {
        effectType: 'spotlight',
      },
    },
  },
  {
    id: 'fx-neon-glow',
    title: 'Ambient Neon Glow',
    category: 'Canvas FX',
    durationMs: 4000,
    preview: (
      <div className="w-16 h-8 rounded border border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.7)] flex items-center justify-center">
        <span className="text-[9px] font-mono text-indigo-300">Glow</span>
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: 'Ambient Neon Glow',
      durationMs: 4000,
      color: '#6366f1',
      payload: {
        effectType: 'neon-glow',
      },
    },
  },
  {
    id: 'fx-vignette',
    title: 'Cinematic Vignette',
    category: 'Canvas FX',
    durationMs: 4000,
    preview: (
      <div className="w-16 h-9 rounded bg-gradient-to-r from-black/80 via-transparent to-black/80 flex items-center justify-center">
        <EyeIcon className="w-4 h-4 text-white/70" />
      </div>
    ),
    itemData: {
      trackType: 'effects',
      name: 'Cinematic Vignette',
      durationMs: 4000,
      color: '#475569',
      payload: {
        effectType: 'vignette',
      },
    },
  },
];

export function StudioEffectsTab({ onAddClip }: StudioEffectsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = EFFECT_PRESETS.filter((e) =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full gap-3 overflow-y-auto pr-1">
      {/* Search Bar */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search effects..."
          className="h-8 pl-8 text-xs bg-secondary/30 border-border/40 focus-visible:ring-1"
        />
      </div>

      {/* Grid of Effects Presets */}
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
