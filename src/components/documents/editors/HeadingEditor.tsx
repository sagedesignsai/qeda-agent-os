/**
 * components/documents/editors/HeadingEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for Heading blocks:
 *   - Levels H1–H4, alignment, subtitle, badge
 *   - PDF Outline Bookmarking (table of contents navigation)
 *   - Orphan/widow prevention (minPresenceAhead)
 *   - Internal destination anchor ID (id for #hash links)
 *   - Hyphenation penalty tuning
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  BookmarkIcon,
  ShieldCheckIcon,
  HashIcon,
  SlidersIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { HeadingBlock } from '@/lib/pdf-studio/types';

interface HeadingEditorProps {
  block: HeadingBlock;
  onUpdate: (updates: Partial<HeadingBlock>) => void;
}

export function HeadingEditor({ block, onUpdate }: HeadingEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const defaultMinPresence =
    block.level === 1
      ? 35
      : block.level === 2
        ? 25
        : block.level === 3
          ? 20
          : 15;

  const isBookmarked =
    block.bookmark === undefined ? block.level <= 2 : block.bookmark !== false;

  const customBookmarkTitle =
    typeof block.bookmark === 'string'
      ? block.bookmark
      : typeof block.bookmark === 'object'
        ? block.bookmark.title
        : '';

  return (
    <div className="space-y-2">
      {/* Level, Alignment, Badge, and Advanced Toggle */}
      <div className="flex items-center gap-2">
        {/* Level selector */}
        <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
          {([1, 2, 3, 4] as const).map((lvl) => (
            <Button
              key={lvl}
              variant={block.level === lvl ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs font-semibold"
              onClick={() => onUpdate({ level: lvl })}
            >
              H{lvl}
            </Button>
          ))}
        </div>

        {/* Alignment */}
        <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
          <Button
            variant={
              block.align === 'left' || !block.align ? 'secondary' : 'ghost'
            }
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate({ align: 'left' })}
          >
            <AlignLeftIcon className="h-3 w-3" />
          </Button>
          <Button
            variant={block.align === 'center' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate({ align: 'center' })}
          >
            <AlignCenterIcon className="h-3 w-3" />
          </Button>
          <Button
            variant={block.align === 'right' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate({ align: 'right' })}
          >
            <AlignRightIcon className="h-3 w-3" />
          </Button>
        </div>

        {/* Tag / Badge */}
        <Input
          placeholder="Badge (optional, e.g. PROPOSAL)"
          value={block.badge || ''}
          onChange={(e) => onUpdate({ badge: e.target.value || undefined })}
          className="h-7 text-xs flex-1"
        />

        {/* Advanced PDF Settings Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showAdvanced ? 'secondary' : 'outline'}
              size="icon"
              className="h-7 w-7 shrink-0 text-xs"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <SlidersIcon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            PDF Bookmarks, Orphan Prevention & Anchor ID
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Heading Text Input */}
      <Input
        placeholder="Heading text (supports **bold**, *italic*, [link](#anchor))..."
        value={block.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        className="font-semibold text-sm"
      />

      {/* Subtitle Input */}
      <Input
        placeholder="Subtitle or description (optional)..."
        value={block.subtitle || ''}
        onChange={(e) => onUpdate({ subtitle: e.target.value || undefined })}
        className="h-7 text-xs text-muted-foreground"
      />

      {/* Advanced PDF Text Controls Drawer */}
      {showAdvanced && (
        <div className="rounded-md border border-border/70 bg-muted/20 p-2.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-4">
            {/* Bookmark in PDF Outline */}
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant={isBookmarked ? 'secondary' : 'outline'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() =>
                  onUpdate({
                    bookmark: isBookmarked ? false : true,
                  })
                }
              >
                <BookmarkIcon className="h-3 w-3" />
                {isBookmarked ? 'In PDF Bookmarks' : 'Not Bookmarked'}
              </Button>
              {isBookmarked && (
                <Input
                  placeholder="Outline title (defaults to heading text)"
                  value={customBookmarkTitle}
                  onChange={(e) =>
                    onUpdate({
                      bookmark: e.target.value || true,
                    })
                  }
                  className="h-6 text-[11px] flex-1"
                />
              )}
            </div>

            {/* Keep with Next Block (Orphan prevention / minPresenceAhead) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Keep with next:</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Guarantees no page break occurs between heading and following
                  content within n points (minPresenceAhead).
                </TooltipContent>
              </Tooltip>
              <Input
                type="number"
                value={block.minPresenceAhead ?? defaultMinPresence}
                onChange={(e) =>
                  onUpdate({
                    minPresenceAhead: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="h-6 w-14 text-center text-[11px]"
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            {/* Anchor Destination ID */}
            <div className="flex items-center gap-1.5 flex-1">
              <HashIcon className="h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Anchor ID for links (e.g. section-pricing)"
                value={block.anchorId || ''}
                onChange={(e) =>
                  onUpdate({ anchorId: e.target.value || undefined })
                }
                className="h-6 text-[11px] font-mono"
              />
            </div>

            {/* Hyphenation toggle */}
            <Button
              variant={
                block.hyphenationPenalty === Infinity ? 'secondary' : 'ghost'
              }
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() =>
                onUpdate({
                  hyphenationPenalty:
                    block.hyphenationPenalty === Infinity
                      ? undefined
                      : Infinity,
                })
              }
            >
              {block.hyphenationPenalty === Infinity
                ? 'Hyphenation: Disabled'
                : 'Hyphenation: Auto'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
