/**
 * components/workspace/editors/TableBlockEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Specialized inline editor for table blocks. The grid edits the block's
 * pipe-table markdown directly, so the stored format stays plain markdown and
 * nothing new has to be persisted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import type { Block, MarkdownTable } from '@/lib/markdown-blocks';
import {
  parseTableMarkdown,
  serializeTableMarkdown,
} from '@/lib/markdown-blocks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlusIcon, Trash2Icon } from 'lucide-react';

interface TableBlockEditorProps {
  block: Block;
  onChange: (text: string) => void;
  className?: string;
}

/** Header cells are row -1; body rows are 0-based. */
interface ActiveCell {
  row: number;
  col: number;
}

export function TableBlockEditor({
  block,
  onChange,
  className,
}: TableBlockEditorProps) {
  const table: MarkdownTable = parseTableMarkdown(block.text) ?? {
    header: ['Column 1', 'Column 2'],
    rows: [['', '']],
  };
  const [active, setActive] = useState<ActiveCell>({ row: -1, col: 0 });

  const commit = (next: MarkdownTable) => {
    onChange(serializeTableMarkdown(next));
  };

  const clone = (): MarkdownTable => ({
    header: [...table.header],
    rows: table.rows.map((row) => [...row]),
  });

  const setCell = (row: number, col: number, value: string) => {
    const next = clone();
    if (row < 0) next.header[col] = value;
    else next.rows[row][col] = value;
    commit(next);
  };

  const addRow = () => {
    const next = clone();
    next.rows.push(next.header.map(() => ''));
    commit(next);
    setActive({ row: next.rows.length - 1, col: active.col });
  };

  const addColumn = () => {
    const next = clone();
    next.header.push('');
    next.rows = next.rows.map((row) => [...row, '']);
    commit(next);
    setActive({ row: active.row, col: next.header.length - 1 });
  };

  const deleteRow = () => {
    if (active.row < 0) return;
    const next = clone();
    next.rows.splice(active.row, 1);
    commit(next);
    setActive({ row: -1, col: active.col });
  };

  const deleteColumn = () => {
    if (table.header.length <= 1) return;
    const next = clone();
    next.header.splice(active.col, 1);
    next.rows = next.rows.map((row) => {
      row.splice(active.col, 1);
      return row;
    });
    commit(next);
    setActive({
      row: -1,
      col: Math.max(0, Math.min(active.col, next.header.length - 1)),
    });
  };

  const cellClass =
    'w-full bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-accent/40';

  return (
    <div className={cn('space-y-1.5 py-1', className)}>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {table.header.map((cell, col) => (
                <th
                  key={col}
                  className="border border-border bg-muted/40 p-0 text-left font-semibold"
                >
                  <input
                    value={cell}
                    onChange={(e) => setCell(-1, col, e.target.value)}
                    onFocus={() => setActive({ row: -1, col })}
                    placeholder={`Column ${col + 1}`}
                    aria-label={`Header column ${col + 1}`}
                    className={cn(cellClass, 'font-semibold')}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, col) => (
                  <td key={col} className="border border-border p-0 align-top">
                    <input
                      value={cell}
                      onChange={(e) => setCell(rowIndex, col, e.target.value)}
                      onFocus={() => setActive({ row: rowIndex, col })}
                      placeholder="…"
                      aria-label={`Row ${rowIndex + 1}, column ${col + 1}`}
                      className={cellClass}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-0.5 text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={addRow}
        >
          <PlusIcon className="size-3" /> Row
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={addColumn}
        >
          <PlusIcon className="size-3" /> Column
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={deleteRow}
          disabled={active.row < 0}
        >
          <Trash2Icon className="size-3" /> Row
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={deleteColumn}
          disabled={table.header.length <= 1}
        >
          <Trash2Icon className="size-3" /> Column
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          Markdown table
        </span>
      </div>
    </div>
  );
}
