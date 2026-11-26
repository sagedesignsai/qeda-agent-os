/**
 * components/studio/content/tabs/StudioShapesTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Vector shape library for the Studio Content Panel.
 *
 * Drag a preset onto the timeline (or use the + button) to create a
 * `itemType: 'shape'` overlay clip. Choose a fill colour before inserting; edit
 * the path afterwards with Text & Shapes → Edit Shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, type ReactNode } from 'react';
import {
  CircleIcon,
  MessageSquareIcon,
  MoveRightIcon,
  PenToolIcon,
  RectangleHorizontalIcon,
  SearchIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { StudioShapeKind } from '@/lib/studio/types';
import {
  createArrowShape,
  createCalloutShape,
  createCircleShape,
  createHeartShape,
  createRectShape,
} from '@/lib/studio/shapes/presets';
import { cn } from '@/lib/utils';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';

interface StudioShapesTabProps {
  onAddClip: (clip: ContentItemPayload) => void;
}

const FILL_SWATCHES = [
  '#ffffff',
  '#0f172a',
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
];

interface ShapePreset {
  id: string;
  title: string;
  shapeKind: StudioShapeKind;
  pathData: string;
  preview: ReactNode;
  keywords: string;
}

function shapePayload(
  preset: Pick<ShapePreset, 'shapeKind' | 'pathData'>,
  fill: string,
): ContentItemPayload {
  return {
    trackType: 'overlays',
    itemType: 'shape',
    name: `${preset.shapeKind[0].toUpperCase()}${preset.shapeKind.slice(1)} shape`,
    durationMs: 3000,
    color: '#f59e0b',
    payload: {
      shapeKind: preset.shapeKind,
      pathData: preset.pathData,
      fill,
      stroke: { color: '#0f172a', width: 3 },
      trim: { start: 0, end: 1, offset: 0 },
    } as unknown as ContentItemPayload['payload'],
  };
}

const PRESETS: ShapePreset[] = [
  {
    id: 'shape-rect',
    title: 'Rectangle',
    shapeKind: 'rect',
    pathData: createRectShape(120, 90, 10),
    keywords: 'square box block frame',
    preview: (
      <svg viewBox="-90 -70 180 140" className="h-full w-full">
        <rect
          x={-60}
          y={-45}
          width={120}
          height={90}
          rx={10}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={3}
        />
      </svg>
    ),
  },
  {
    id: 'shape-circle',
    title: 'Circle',
    shapeKind: 'circle',
    pathData: createCircleShape(60),
    keywords: 'ellipse round dot badge',
    preview: (
      <svg viewBox="-90 -70 180 140" className="h-full w-full">
        <circle
          r={55}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={3}
        />
      </svg>
    ),
  },
  {
    id: 'shape-arrow',
    title: 'Arrow',
    shapeKind: 'arrow',
    pathData: createArrowShape(160, 64, 46),
    keywords: 'pointer direction next',
    preview: (
      <svg viewBox="-90 -70 180 140" className="h-full w-full">
        <path
          d={createArrowShape(150, 60, 44)}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'shape-callout',
    title: 'Callout',
    shapeKind: 'callout',
    pathData: createCalloutShape(140, 80, 10, 18),
    keywords: 'speech bubble balloon tooltip comment',
    preview: (
      <svg viewBox="-90 -70 180 140" className="h-full w-full">
        <path
          d={createCalloutShape(130, 76, 10, 16)}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'shape-path',
    title: 'Custom Path',
    shapeKind: 'path',
    pathData: createHeartShape(120),
    keywords: 'heart freeform svg bezier',
    preview: (
      <svg viewBox="-90 -70 180 140" className="h-full w-full">
        <path
          d={createHeartShape(110)}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={3}
        />
      </svg>
    ),
  },
];

const PRESET_ICONS: Record<StudioShapeKind, typeof RectangleHorizontalIcon> = {
  rect: RectangleHorizontalIcon,
  circle: CircleIcon,
  arrow: MoveRightIcon,
  callout: MessageSquareIcon,
  path: PenToolIcon,
};

export function StudioShapesTab({ onAddClip }: StudioShapesTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [fill, setFill] = useState('#ffffff');

  const filtered = PRESETS.filter((preset) => {
    const haystack = `${preset.title} ${preset.keywords}`.toLowerCase();
    return haystack.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1">
      <div className="relative shrink-0">
        <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search shapes..."
          aria-label="Search shapes"
          className="h-8 border-border/40 bg-secondary/30 pl-8 text-xs focus-visible:ring-1"
        />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground">
          Fill
        </span>
        {FILL_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set shape fill to ${color}`}
            aria-pressed={fill === color}
            onClick={() => setFill(color)}
            style={{ backgroundColor: color }}
            className={cn(
              'size-4 rounded-full border transition-transform hover:scale-110',
              fill === color
                ? 'border-primary ring-2 ring-primary/50'
                : 'border-border/70',
            )}
          />
        ))}
        <label className="ml-auto flex size-5 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border/70">
          <input
            type="color"
            value={fill}
            aria-label="Custom shape fill color"
            onChange={(event) => setFill(event.target.value)}
            className="size-7 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {filtered.map((preset) => {
          const Icon = PRESET_ICONS[preset.shapeKind];
          return (
            <ContentCardItem
              key={preset.id}
              id={preset.id}
              title={preset.title}
              subtitle={preset.shapeKind === 'path' ? 'SVG path' : 'Vector shape'}
              badge="3s"
              previewNode={
                <div className="relative flex h-full w-full items-center justify-center">
                  {preset.preview}
                  <span className="absolute right-1 bottom-1 rounded bg-black/50 p-0.5 text-white/80">
                    <Icon className="size-2.5" />
                  </span>
                </div>
              }
              itemData={shapePayload(preset, fill)}
              onAdd={onAddClip}
            />
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-[11px] text-muted-foreground">
          No shapes match “{searchQuery}”.
        </p>
      )}

      <p className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5 text-[9px] leading-relaxed text-muted-foreground">
        Drag a shape onto the timeline or click + to insert it at the playhead.
        Use <span className="font-medium text-foreground">Edit Shape</span> in
        the ⌘K command bar to customise the path, stroke and trim animation.
      </p>
    </div>
  );
}