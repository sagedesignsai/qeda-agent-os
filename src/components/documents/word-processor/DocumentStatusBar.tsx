/**
 * components/documents/word-processor/DocumentStatusBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Word Processor Bottom Status Bar:
 *   - Page count and active page locator
 *   - Live word and character count metrics
 *   - Page format badge (A4/Letter, orientation)
 *   - Zoom scale slider and quick reset buttons
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  ZoomInIcon,
  ZoomOutIcon,
  Maximize2Icon,
  FileTextIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { PageSize, PageOrientation } from '@/lib/pdf-studio/types';
import type { DocumentStats } from './use-word-processor';

interface DocumentStatusBarProps {
  stats: DocumentStats;
  pageSize: PageSize;
  orientation: PageOrientation;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  activePageIndex?: number;
  totalPages?: number;
}

export function DocumentStatusBar({
  stats,
  pageSize,
  orientation,
  zoom,
  onSetZoom,
  activePageIndex = 1,
  totalPages = 1,
}: DocumentStatusBarProps) {
  return (
    <div className="flex h-7 w-full items-center justify-between border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground select-none flex-shrink-0">
      {/* Left: Page tracker & live word/character stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-medium text-foreground/80">
          <FileTextIcon className="h-3 w-3 text-primary" />
          <span>
            Page {activePageIndex} of {totalPages}
          </span>
        </div>

        <span className="text-zinc-600">•</span>

        <div className="flex items-center gap-2">
          <span>
            {stats.words.toLocaleString()}{' '}
            {stats.words === 1 ? 'word' : 'words'}
          </span>
          <span className="text-zinc-600">,</span>
          <span>{stats.characters.toLocaleString()} characters</span>
        </div>

        <span className="text-zinc-600">•</span>

        <span className="font-mono text-[10px] uppercase text-muted-foreground/80">
          {pageSize} ({orientation})
        </span>
      </div>

      {/* Right: Zoom controls and slider */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={() => onSetZoom(Math.max(50, zoom - 15))}
              disabled={zoom <= 50}
            >
              <ZoomOutIcon className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>

        <div className="w-20">
          <Slider
            value={[zoom]}
            min={50}
            max={200}
            step={5}
            onValueChange={([val]) => onSetZoom(val)}
            className="cursor-pointer"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={() => onSetZoom(Math.min(200, zoom + 15))}
              disabled={zoom >= 200}
            >
              <ZoomInIcon className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onSetZoom(100)}
              className="font-mono text-[10px] min-w-[2.5rem] text-right hover:text-foreground transition-colors"
            >
              {zoom}%
            </button>
          </TooltipTrigger>
          <TooltipContent>Reset Zoom (100%)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
