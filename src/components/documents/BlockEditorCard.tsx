/**
 * components/documents/BlockEditorCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive editor card for a single PDF block in the composer outline.
 *
 * Responsibilities:
 *   - Card container & header chrome (type badge, icon, and status indicators)
 *   - Reordering actions (Move Up / Down)
 *   - Structure management (Duplicate, Delete)
 *   - Pagination rules: Unbreakable block (wrap=false) and Break Before
 *   - Dispatches rendering to specialized sub-editors in ./editors
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  HeadingIcon,
  AlignLeftIcon,
  TableIcon,
  InfoIcon,
  BarChart3Icon,
  MinusIcon,
  PenToolIcon,
  ColumnsIcon,
  Trash2Icon,
  CopyIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SplitIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PdfBlock } from '@/lib/pdf-studio/types';
import {
  HeadingEditor,
  ParagraphEditor,
  TableEditor,
  CalloutEditor,
  MetricsEditor,
  ColumnsEditor,
  SignatureEditor,
  DividerEditor,
} from './editors';

interface BlockEditorCardProps {
  block: PdfBlock;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updates: Partial<PdfBlock>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function BlockEditorCard({
  block,
  isFirst,
  isLast,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: BlockEditorCardProps) {
  const getBlockMeta = () => {
    switch (block.type) {
      case 'heading':
        return {
          label: `Heading ${block.level}`,
          icon: HeadingIcon,
          color: 'text-sky-400',
        };
      case 'paragraph':
        return {
          label: 'Paragraph',
          icon: AlignLeftIcon,
          color: 'text-zinc-400',
        };
      case 'table':
        return {
          label: 'Data Table',
          icon: TableIcon,
          color: 'text-emerald-400',
        };
      case 'callout':
        return {
          label: 'Callout Box',
          icon: InfoIcon,
          color: 'text-amber-400',
        };
      case 'metrics':
        return {
          label: 'Metric Cards',
          icon: BarChart3Icon,
          color: 'text-purple-400',
        };
      case 'columns':
        return {
          label: 'Columns',
          icon: ColumnsIcon,
          color: 'text-indigo-400',
        };
      case 'divider':
        return { label: 'Divider', icon: MinusIcon, color: 'text-zinc-500' };
      case 'page-break':
        return { label: 'Page Break', icon: SplitIcon, color: 'text-rose-400' };
      case 'signature':
        return {
          label: 'Signature',
          icon: PenToolIcon,
          color: 'text-teal-400',
        };
      default:
        return { label: 'Block', icon: AlignLeftIcon, color: 'text-zinc-400' };
    }
  };

  const meta = getBlockMeta();
  const Icon = meta.icon;

  return (
    <div className="group relative rounded-lg border border-border/60 bg-card/60 p-3.5 shadow-sm transition-all hover:border-border hover:shadow-md">
      {/* Top Header Row */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-muted/60">
            <Icon className={cn('h-3.5 w-3.5', meta.color)} />
          </div>
          <span className="text-xs font-semibold tracking-wide text-foreground/90">
            {meta.label}
          </span>
          {block.wrap === false && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              Unbreakable
            </span>
          )}
          {block.breakBefore && (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
              Break Before
            </span>
          )}
          {block.anchorId && (
            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-mono text-sky-400">
              #{block.anchorId}
            </span>
          )}
          {block.type === 'heading' && block.bookmark !== false && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              TOC Outline
            </span>
          )}
          {block.minPresenceAhead ? (
            <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
              +{block.minPresenceAhead}pt Ahead
            </span>
          ) : null}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
          {/* Unbreakable toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={block.wrap === false ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6 text-xs"
                onClick={() =>
                  onUpdate({ wrap: block.wrap === false ? true : false })
                }
              >
                <ShieldCheckIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {block.wrap === false
                ? 'Allow page split inside block'
                : 'Keep block together on one page (wrap=false)'}
            </TooltipContent>
          </Tooltip>

          {/* Move Up */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isFirst}
                onClick={onMoveUp}
              >
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move Up</TooltipContent>
          </Tooltip>

          {/* Move Down */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isLast}
                onClick={onMoveDown}
              >
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move Down</TooltipContent>
          </Tooltip>

          {/* Duplicate */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDuplicate}
              >
                <CopyIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate Block</TooltipContent>
          </Tooltip>

          {/* Delete */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2Icon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Block</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Block Body Editor */}
      <div className="space-y-2">
        {block.type === 'heading' && (
          <HeadingEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'paragraph' && (
          <ParagraphEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'table' && (
          <TableEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'callout' && (
          <CalloutEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'metrics' && (
          <MetricsEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'columns' && (
          <ColumnsEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'signature' && (
          <SignatureEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'divider' && (
          <DividerEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'page-break' && (
          <div className="flex items-center justify-center rounded border border-dashed border-border/80 py-3 text-xs text-muted-foreground">
            --- Forced Page Break ---
          </div>
        )}
      </div>
    </div>
  );
}
