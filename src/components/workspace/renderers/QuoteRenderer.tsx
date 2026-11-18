/**
 * components/workspace/renderers/QuoteRenderer.tsx
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseInlineMarkdown, renderInlineTokens } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';

interface QuoteRendererProps {
  block: Block;
  className?: string;
}

export function QuoteRenderer({ block, className }: QuoteRendererProps) {
  // Remove the "> " prefix from the text
  const text = block.text.replace(/^>\s*/, '');
  const tokens = parseInlineMarkdown(text);
  const content = renderInlineTokens(tokens);

  return (
    <blockquote
      className={cn(
        'my-1 border-l-4 border-primary/30 py-0.5 pl-4 italic text-muted-foreground',
        className,
      )}
    >
      {content}
    </blockquote>
  );
}
