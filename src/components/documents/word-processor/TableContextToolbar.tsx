/**
 * components/documents/word-processor/TableContextToolbar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Contextual floating action toolbar for active Data Tables:
 *   - Add/Remove rows (above, below)
 *   - Add/Remove columns (left, right)
 *   - Toggle table borders and zebra striping
 *   - Clear or remove entire table
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  PlusIcon,
  Trash2Icon,
  RowsIcon,
  ColumnsIcon,
  CheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TableBlock } from '@/lib/pdf-studio/types';

interface TableContextToolbarProps {
  block: TableBlock;
  selectedRow?: number;
  selectedCol?: number;
  onAddRow: () => void;
  onDeleteRow: (rowIndex: number) => void;
  onAddCol: () => void;
  onDeleteCol: (colIndex: number) => void;
  onUpdateBlock: (updates: Partial<TableBlock>) => void;
  onDeleteTable: () => void;
}

export function TableContextToolbar({
  block,
  selectedRow = 0,
  selectedCol = 0,
  onAddRow,
  onDeleteRow,
  onAddCol,
  onDeleteCol,
  onUpdateBlock,
  onDeleteTable,
}: TableContextToolbarProps) {
  return (
    <div className="absolute -top-9 left-0 z-20 flex items-center gap-1 rounded-md border border-border/80 bg-zinc-900/95 px-2 py-1 shadow-lg backdrop-blur-md text-xs text-zinc-100 select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Row Operations */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800"
            onClick={onAddRow}
          >
            <PlusIcon className="h-3 w-3 text-emerald-400" />
            <span>Row</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert Row</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-300 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30"
            onClick={() => onDeleteRow(selectedRow)}
            disabled={block.rows.length <= 1}
          >
            <Trash2Icon className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete Active Row ({selectedRow + 1})</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-3.5 bg-zinc-700 mx-0.5" />

      {/* Column Operations */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800"
            onClick={onAddCol}
          >
            <PlusIcon className="h-3 w-3 text-sky-400" />
            <span>Col</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert Column</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-300 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30"
            onClick={() => onDeleteCol(selectedCol)}
            disabled={block.columns.length <= 1}
          >
            <Trash2Icon className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete Active Col ({selectedCol + 1})</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-3.5 bg-zinc-700 mx-0.5" />

      {/* Table Style Toggles */}
      <Button
        variant={block.striped ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 px-1.5 text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-800"
        onClick={() => onUpdateBlock({ striped: !block.striped })}
      >
        Zebra
      </Button>

      <Button
        variant={block.showBorders ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 px-1.5 text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-800"
        onClick={() => onUpdateBlock({ showBorders: !block.showBorders })}
      >
        Borders
      </Button>

      <Separator orientation="vertical" className="h-3.5 bg-zinc-700 mx-0.5" />

      {/* Delete Whole Table */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-rose-400 hover:bg-rose-950/40"
            onClick={onDeleteTable}
          >
            <Trash2Icon className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete Table</TooltipContent>
      </Tooltip>
    </div>
  );
}
