/**
 * components/workspace/renderers/HeadingRenderer.tsx
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseInlineMarkdown, renderInlineTokens } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';

interface HeadingRendererProps {
  block: Block;
  className?: string;
}

export function HeadingRenderer({ block, className }: HeadingRendererProps) {
  const tokens = parseInlineMarkdown(block.text);
  const content = renderInlineTokens(tokens);

  const Tag =
    block.type === 'heading1' ? 'h1' : block.type === 'heading2' ? 'h2' : 'h3';
  const headingClass =
    block.type === 'heading1'
      ? 'mt-5 text-2xl font-bold tracking-tight'
      : block.type === 'heading2'
        ? 'mt-4 text-xl font-bold tracking-tight'
        : 'mt-3 text-lg font-semibold';

  return (
    <Tag className={cn(headingClass, 'text-foreground', className)}>
      {content}
    </Tag>
  );
}
