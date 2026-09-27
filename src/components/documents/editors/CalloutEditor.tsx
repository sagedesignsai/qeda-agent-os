/**
 * components/documents/editors/CalloutEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for Callout blocks (variant, title, text).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CalloutBlock } from '@/lib/pdf-studio/types';

interface CalloutEditorProps {
  block: CalloutBlock;
  onUpdate: (updates: Partial<CalloutBlock>) => void;
}

export function CalloutEditor({ block, onUpdate }: CalloutEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
          {(['info', 'warning', 'success', 'note', 'quote'] as const).map(
            (v) => (
              <Button
                key={v}
                variant={block.variant === v ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px] capitalize"
                onClick={() => onUpdate({ variant: v })}
              >
                {v}
              </Button>
            ),
          )}
        </div>
        <Input
          placeholder="Callout title (optional)..."
          value={block.title || ''}
          onChange={(e) => onUpdate({ title: e.target.value || undefined })}
          className="h-7 text-xs flex-1 font-medium"
        />
      </div>

      <Textarea
        placeholder="Callout text..."
        value={block.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        rows={2}
        className="text-xs"
      />
    </div>
  );
}
