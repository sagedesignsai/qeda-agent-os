/**
 * components/documents/editors/TableEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline interactive grid editor for Table blocks (rows, columns, striping).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TableBlock } from '@/lib/pdf-studio/types';

interface TableEditorProps {
  block: TableBlock;
  onUpdate: (updates: Partial<TableBlock>) => void;
}

export function TableEditor({ block, onUpdate }: TableEditorProps) {
  const handleHeaderChange = (colIndex: number, newHeader: string) => {
    const nextCols = [...block.columns];
    nextCols[colIndex] = { ...nextCols[colIndex], header: newHeader };
    onUpdate({ columns: nextCols });
  };

  const handleCellChange = (rIdx: number, cIdx: number, val: string) => {
    const nextRows = block.rows.map((row, i) => {
      if (i === rIdx) {
        const newRow = [...row];
        newRow[cIdx] = val;
        return newRow;
      }
      return row;
    });
    onUpdate({ rows: nextRows });
  };

  const addRow = () => {
    const newRow = new Array(block.columns.length).fill('');
    onUpdate({ rows: [...block.rows, newRow] });
  };

  const deleteRow = (rIdx: number) => {
    if (block.rows.length <= 1) return;
    onUpdate({ rows: block.rows.filter((_, i) => i !== rIdx) });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-border/60 bg-muted/20 p-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60">
              {block.columns.map((col, cIdx) => (
                <th key={col.id} className="pb-1 pr-1 text-left font-semibold">
                  <Input
                    value={col.header}
                    onChange={(e) => handleHeaderChange(cIdx, e.target.value)}
                    className="h-6 text-[11px] font-bold"
                  />
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="border-b border-border/30 last:border-none"
              >
                {block.columns.map((col, cIdx) => (
                  <td key={col.id} className="py-1 pr-1">
                    <Input
                      value={row[cIdx] ?? ''}
                      onChange={(e) =>
                        handleCellChange(rIdx, cIdx, e.target.value)
                      }
                      className="h-6 text-[11px]"
                    />
                  </td>
                ))}
                <td className="py-1 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRow(rIdx)}
                  >
                    <Trash2Icon className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={addRow}
        >
          <PlusIcon className="h-3 w-3" />
          Add Row
        </Button>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={block.striped ?? true}
            onChange={(e) => onUpdate({ striped: e.target.checked })}
            className="rounded border-border/60 text-primary"
          />
          Zebra striping
        </label>
      </div>
    </div>
  );
}
