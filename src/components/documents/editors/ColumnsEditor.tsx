/**
 * components/documents/editors/ColumnsEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for multi-column blocks (column titles and text content).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ColumnsBlock, ParagraphBlock } from '@/lib/pdf-studio/types';

interface ColumnsEditorProps {
  block: ColumnsBlock;
  onUpdate: (updates: Partial<ColumnsBlock>) => void;
}

export function ColumnsEditor({ block, onUpdate }: ColumnsEditorProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {block.columns.map((col, idx) => (
          <div
            key={col.id}
            className="rounded border border-border/60 bg-muted/20 p-2"
          >
            <Input
              placeholder={`Column ${idx + 1} Title`}
              value={col.title || ''}
              onChange={(e) => {
                const nextCols = [...block.columns];
                nextCols[idx] = { ...col, title: e.target.value };
                onUpdate({ columns: nextCols });
              }}
              className="h-6 text-xs font-semibold mb-2"
            />
            <Textarea
              placeholder="Column content..."
              value={
                col.blocks[0] && col.blocks[0].type === 'paragraph'
                  ? (col.blocks[0] as ParagraphBlock).content
                  : ''
              }
              onChange={(e) => {
                const nextCols = [...block.columns];
                const nextChild = {
                  id: col.blocks[0]?.id || nanoid(),
                  type: 'paragraph' as const,
                  content: e.target.value,
                  fontSize: 10,
                };
                nextCols[idx] = { ...col, blocks: [nextChild] };
                onUpdate({ columns: nextCols });
              }}
              rows={3}
              className="text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
