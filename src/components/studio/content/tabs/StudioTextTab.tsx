/**
 * components/studio/content/tabs/StudioTextTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Text Presets Tab for Studio Content Panel (CapCut-inspired typography presets):
 *   - Heading, Subheading, Body Text
 *   - Lower Third pill
 *   - Gradient Banner
 *   - Callout Pill
 *   - Karaoke Subtitle
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';

interface StudioTextTabProps {
  onAddClip: (clip: ContentItemPayload) => void;
}

interface TextPreset {
  id: string;
  title: string;
  category: string;
  defaultText: string;
  preview: React.ReactNode;
  durationMs: number;
}

const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'text-heading',
    title: 'Primary Heading',
    category: 'Titles',
    defaultText: 'Major Headline',
    durationMs: 3000,
    preview: (
      <div className="flex items-center justify-center font-bold text-base text-white tracking-tight drop-shadow-md">
        Major Headline
      </div>
    ),
  },
  {
    id: 'text-subheading',
    title: 'Subheading',
    category: 'Titles',
    defaultText: 'Feature Subtitle',
    durationMs: 3000,
    preview: (
      <div className="flex items-center justify-center font-semibold text-xs text-indigo-300">
        Feature Subtitle
      </div>
    ),
  },
  {
    id: 'text-body',
    title: 'Body Annotation',
    category: 'Standard',
    defaultText: 'Add an explanatory note here.',
    durationMs: 3500,
    preview: (
      <div className="flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
        Add an explanatory note here.
      </div>
    ),
  },
  {
    id: 'text-lower-third',
    title: 'Lower Third Badge',
    category: 'Badges',
    defaultText: 'Lead Developer • Architecture',
    durationMs: 4000,
    preview: (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 border-l-2 border-indigo-500">
        <span className="text-[10px] font-semibold text-white">
          Lead Developer
        </span>
      </div>
    ),
  },
  {
    id: 'text-gradient-banner',
    title: 'Gradient Callout',
    category: 'Badges',
    defaultText: '⚡ New Feature Released',
    durationMs: 3000,
    preview: (
      <div className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-[10px] shadow-sm">
        ⚡ New Feature
      </div>
    ),
  },
  {
    id: 'text-callout-pill',
    title: 'Minimal Notification',
    category: 'Standard',
    defaultText: '💡 Quick Tip: Use CMD+K to search',
    durationMs: 3000,
    preview: (
      <div className="px-2 py-0.5 rounded-md border border-border/60 bg-secondary/50 text-[9px] text-foreground flex items-center gap-1">
        <span>💡</span>
        <span>Quick Tip</span>
      </div>
    ),
  },
  {
    id: 'text-karaoke',
    title: 'Karaoke Subtitle',
    category: 'Subtitles',
    defaultText: 'Synchronized speech captioning',
    durationMs: 2500,
    preview: (
      <div className="text-center">
        <span className="text-[11px] font-bold text-amber-300 bg-black/40 px-1 rounded">
          Synchronized
        </span>{' '}
        <span className="text-[11px] font-medium text-white/80">caption</span>
      </div>
    ),
  },
];

export function StudioTextTab({ onAddClip }: StudioTextTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = TEXT_PRESETS.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full gap-3 overflow-y-auto overflow-x-hidden pr-1">
      {/* Search Bar */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search text styles..."
          className="h-8 pl-8 text-xs bg-secondary/30 border-border/40 focus-visible:ring-1"
        />
      </div>

      {/* Grid of Text Presets */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((preset) => (
          <ContentCardItem
            key={preset.id}
            id={preset.id}
            title={preset.title}
            subtitle={preset.category}
            badge={`${(preset.durationMs / 1000).toFixed(0)}s`}
            previewNode={preset.preview}
            itemData={{
              trackType: 'captions',
              name: preset.defaultText,
              durationMs: preset.durationMs,
              color: '#0d9488',
              payload: {
                text: preset.defaultText,
              },
            }}
            onAdd={onAddClip}
          />
        ))}
      </div>
    </div>
  );
}
