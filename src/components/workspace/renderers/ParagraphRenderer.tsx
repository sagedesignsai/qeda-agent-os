/**
 * components/workspace/renderers/ParagraphRenderer.tsx
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseInlineMarkdown, renderInlineTokens } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';

interface ParagraphRendererProps {
  block: Block;
  className?: string;
}

export function ParagraphRenderer({
  block,
  className,
}: ParagraphRendererProps) {
  const tokens = parseInlineMarkdown(block.text);
  const content = renderInlineTokens(tokens);

  return (
    <p className={cn('py-0.5 text-foreground leading-relaxed', className)}>
      {content}
    </p>
  );
}
