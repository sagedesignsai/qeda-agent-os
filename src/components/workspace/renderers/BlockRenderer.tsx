/**
 * components/workspace/renderers/BlockRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Render a block as formatted content instead of a textarea.
 * Dispatches to specialized renderers by block type.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { ParagraphRenderer } from './ParagraphRenderer';
import { HeadingRenderer } from './HeadingRenderer';
import { ListRenderer } from './ListRenderer';
import { CodeRenderer } from './CodeRenderer';
import { ImageRenderer } from './ImageRenderer';
import { TableRenderer } from './TableRenderer';
import { DividerRenderer } from './DividerRenderer';
import { TodoRenderer } from './TodoRenderer';
import { QuoteRenderer } from './QuoteRenderer';

interface BlockRendererProps {
  block: Block;
  className?: string;
  /** 1-based position for numbered-list rows. */
  listNumber?: number;
}

/**
 * Render a block based on its type.
 * Each block type has a specialized renderer.
 */
export function BlockRenderer({
  block,
  className,
  listNumber,
}: BlockRendererProps) {
  switch (block.type) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return <HeadingRenderer block={block} className={className} />;

    case 'paragraph':
      return <ParagraphRenderer block={block} className={className} />;

    case 'bulleted-list':
    case 'numbered-list':
      return (
        <ListRenderer
          block={block}
          className={className}
          listNumber={listNumber}
        />
      );

    case 'todo':
      return <TodoRenderer block={block} className={className} />;

    case 'quote':
      return <QuoteRenderer block={block} className={className} />;

    case 'code':
      return <CodeRenderer block={block} className={className} />;

    case 'image':
      return <ImageRenderer block={block} className={className} />;

    case 'table':
      return <TableRenderer block={block} className={className} />;

    case 'divider':
      return <DividerRenderer className={className} />;

    default: {
      const exhaustive: never = block.type;
      return exhaustive;
    }
  }
}
