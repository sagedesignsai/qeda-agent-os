/**
 * components/documents/word-processor/BlockGutterHandle.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unobtrusive gutter handle appearing in the left page margin on hover:
 *   - Drag / move reorder controls
 *   - Quick '+' block insert menu
 *   - Block delete trigger
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  HeadingIcon,
  FileTextIcon,
  TableIcon,
  InfoIcon,
  BarChart3Icon,
  ScissorsIcon,
  PenToolIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BlockType } from '@/lib/pdf-studio/types';

interface BlockGutterHandleProps {
  blockId: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertAfter: (type: BlockType) => void;
  onDelete: () => void;
}

export function BlockGutterHandle({
  blockId,
  onMoveUp,
  onMoveDown,
  onInsertAfter,
  onDelete,
}: BlockGutterHandleProps) {
  return (
    <div className="absolute -left-10 top-0.5 z-10 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity duration-150 select-none">
      {/* Quick Insert '+' Menu */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-5 w-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                <PlusIcon className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">Insert Element Below</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="start" className="w-44 text-xs">
          <DropdownMenuItem onClick={() => onInsertAfter('heading')}>
            <HeadingIcon className="mr-2 h-3.5 w-3.5 text-sky-500" />
            <span>Heading</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertAfter('paragraph')}>
            <FileTextIcon className="mr-2 h-3.5 w-3.5 text-zinc-500" />
            <span>Paragraph</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertAfter('table')}>
            <TableIcon className="mr-2 h-3.5 w-3.5 text-emerald-500" />
            <span>Data Table</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertAfter('callout')}>
            <InfoIcon className="mr-2 h-3.5 w-3.5 text-amber-500" />
            <span>Callout Box</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertAfter('metrics')}>
            <BarChart3Icon className="mr-2 h-3.5 w-3.5 text-purple-500" />
            <span>Metric Cards</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertAfter('page-break')}>
            <ScissorsIcon className="mr-2 h-3.5 w-3.5 text-rose-500" />
            <span>Page Break</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertAfter('signature')}>
            <PenToolIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
            <span>Signature</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reorder and Delete Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-5 w-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors cursor-grab"
          >
            <GripVerticalIcon className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36 text-xs">
          <DropdownMenuItem onClick={onMoveUp}>
            <ChevronUpIcon className="mr-2 h-3.5 w-3.5" />
            <span>Move Up</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMoveDown}>
            <ChevronDownIcon className="mr-2 h-3.5 w-3.5" />
            <span>Move Down</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-rose-500 focus:text-rose-500"
          >
            <Trash2Icon className="mr-2 h-3.5 w-3.5" />
            <span>Delete Block</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
