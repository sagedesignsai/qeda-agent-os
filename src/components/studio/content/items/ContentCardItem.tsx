/**
 * components/studio/content/items/ContentCardItem.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable card item for the Studio Content Panel (Media, Text, Effects, Audio):
 *   - Visual thumbnail or styled typography/effect preview
 *   - Hover overlay with quick 1-click "+" (Add to Timeline) button
 *   - Play / preview action for audio and video assets
 *   - HTML5 drag-and-drop source
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { PlusIcon, PlayIcon, PauseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ContentItemPayload {
  trackType: 'video' | 'captions' | 'effects' | 'audio';
  name: string;
  durationMs: number;
  color?: string;
  payload?: {
    text?: string;
    scale?: number;
    targetX?: number;
    targetY?: number;
    effectType?: string;
    mediaUrl?: string;
    filePath?: string;
    volume?: number;
  };
}

interface ContentCardItemProps {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  previewNode?: React.ReactNode;
  thumbnailUrl?: string;
  itemData: ContentItemPayload;
  onAdd: (item: ContentItemPayload) => void;
  onPreview?: () => void;
  isPlayingPreview?: boolean;
}

export function ContentCardItem({
  title,
  subtitle,
  badge,
  previewNode,
  thumbnailUrl,
  itemData,
  onAdd,
  onPreview,
  isPlayingPreview = false,
}: ContentCardItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/x-qeda-studio-clip',
      JSON.stringify(itemData),
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex flex-col rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 hover:border-border transition-all overflow-hidden cursor-grab active:cursor-grabbing select-none"
    >
      {/* 16:9 Aspect Preview Area */}
      <div className="relative aspect-video w-full bg-secondary/30 flex items-center justify-center overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : previewNode ? (
          <div className="w-full h-full flex items-center justify-center p-2">
            {previewNode}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground/60">
            {itemData.trackType}
          </div>
        )}

        {/* Badge (Duration or Type) */}
        {badge && (
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 backdrop-blur-xs px-1.5 py-0.5 font-mono text-[9px] font-medium text-white/90">
            {badge}
          </div>
        )}

        {/* Hover Action Overlay */}
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center gap-2 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Audio/Video Preview Play Button */}
          {onPreview && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={
                    isPlayingPreview ? 'Pause preview' : 'Play preview'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview();
                  }}
                  className="h-7 w-7 rounded-full bg-background/80 hover:bg-background text-foreground shadow-md"
                >
                  {isPlayingPreview ? (
                    <PauseIcon className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <PlayIcon className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isPlayingPreview ? 'Pause preview' : 'Play preview'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* 1-Click Add to Timeline */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                aria-label="Add to timeline at playhead"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(itemData);
                }}
                className="h-7 w-7 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
              >
                <PlusIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Add to timeline at playhead
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Info Footer */}
      <div className="p-2 flex flex-col gap-0.5">
        <span
          className="text-xs font-medium text-foreground truncate"
          title={title}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] text-muted-foreground truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
