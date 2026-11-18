/**
 * components/workspace/renderers/TodoRenderer.tsx
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseInlineMarkdown, renderInlineTokens } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';
import { CheckCircle2Icon, CircleIcon } from 'lucide-react';

interface TodoRendererProps {
  block: Block;
  className?: string;
}

export function TodoRenderer({ block, className }: TodoRendererProps) {
  // Extract the todo text (remove the "- [ ]" or "- [x]" prefix)
  const text = block.text.replace(/^-\s*\[.\]\s*/, '');
  const tokens = parseInlineMarkdown(text);
  const content = renderInlineTokens(tokens);
  const isDone = block.checked === true;

  return (
    <div
      className={cn('flex items-start gap-2 py-0.5 text-foreground', className)}
    >
      {isDone ? (
        <CheckCircle2Icon className="size-5 shrink-0 text-emerald-500 mt-0.5" />
      ) : (
        <CircleIcon className="size-5 shrink-0 text-muted-foreground mt-0.5" />
      )}
      <span className={isDone ? 'line-through text-muted-foreground' : ''}>
        {content}
      </span>
    </div>
  );
}
