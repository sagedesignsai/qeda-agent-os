/**
 * components/documents/editors/MetricsEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for Metrics cards (value, label, change indicator, add/remove).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MetricsBlock } from '@/lib/pdf-studio/types';

interface MetricsEditorProps {
  block: MetricsBlock;
  onUpdate: (updates: Partial<MetricsBlock>) => void;
}

export function MetricsEditor({ block, onUpdate }: MetricsEditorProps) {
  const updateItem = (
    id: string,
    updates: Partial<MetricsBlock['items'][0]>,
  ) => {
    const nextItems = block.items.map((i) =>
      i.id === id ? { ...i, ...updates } : i,
    );
    onUpdate({ items: nextItems });
  };

  const addItem = () => {
    onUpdate({
      items: [
        ...block.items,
        { id: nanoid(), label: 'New Metric', value: '100%', change: '+10%' },
      ],
    });
  };

  const deleteItem = (id: string) => {
    if (block.items.length <= 1) return;
    onUpdate({ items: block.items.filter((i) => i.id !== id) });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {block.items.map((item) => (
          <div
            key={item.id}
            className="relative rounded border border-border/60 bg-muted/20 p-2"
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <Input
                placeholder="Value"
                value={item.value}
                onChange={(e) => updateItem(item.id, { value: e.target.value })}
                className="h-6 text-xs font-bold w-1/2"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => deleteItem(item.id)}
              >
                <Trash2Icon className="h-3 w-3" />
              </Button>
            </div>
            <Input
              placeholder="Label"
              value={item.label}
              onChange={(e) => updateItem(item.id, { label: e.target.value })}
              className="h-5 text-[10px] text-muted-foreground mb-1"
            />
            <Input
              placeholder="Change / note"
              value={item.change || ''}
              onChange={(e) =>
                updateItem(item.id, { change: e.target.value || undefined })
              }
              className="h-5 text-[10px]"
            />
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-6 gap-1 px-2 text-[11px]"
        onClick={addItem}
      >
        <PlusIcon className="h-3 w-3" />
        Add Metric Card
      </Button>
    </div>
  );
}
