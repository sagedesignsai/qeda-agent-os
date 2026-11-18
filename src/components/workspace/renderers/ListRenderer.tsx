/**
 * components/workspace/renderers/ListRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists are stored one item per block, so this renders a single marker + item
 * instead of a wrapping <ul>/<ol> (which would be invalid around one <li>).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseInlineMarkdown, renderInlineTokens } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';

interface ListRendererProps {
  block: Block;
  className?: string;
  /** 1-based position among consecutive numbered-list blocks. */
  listNumber?: number;
}

export function ListRenderer({
  block,
  className,
  listNumber = 1,
}: ListRendererProps) {
  const tokens = parseInlineMarkdown(block.text);
  const content = renderInlineTokens(tokens);
  const marker = block.type === 'bulleted-list' ? '•' : `${listNumber}.`;

  return (
    <div
      className={cn('flex items-start gap-2 py-0.5 text-foreground', className)}
    >
      <span
        aria-hidden
        className={cn(
          'select-none text-muted-foreground',
          block.type === 'numbered-list' && 'min-w-4 text-right tabular-nums',
        )}
      >
        {marker}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">{content}</span>
    </div>
  );
}
