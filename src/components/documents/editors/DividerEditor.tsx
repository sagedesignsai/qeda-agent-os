/**
 * components/documents/editors/DividerEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for Divider rules (solid, dashed, dotted).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Button } from '@/components/ui/button';
import type { DividerBlock } from '@/lib/pdf-studio/types';

interface DividerEditorProps {
  block: DividerBlock;
  onUpdate: (updates: Partial<DividerBlock>) => void;
}

export function DividerEditor({ block, onUpdate }: DividerEditorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Style:</span>
      {(['solid', 'dashed', 'dotted'] as const).map((s) => (
        <Button
          key={s}
          variant={
            block.style === s || (!block.style && s === 'solid')
              ? 'secondary'
              : 'ghost'
          }
          size="sm"
          className="h-6 px-2 text-xs capitalize"
          onClick={() => onUpdate({ style: s })}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
