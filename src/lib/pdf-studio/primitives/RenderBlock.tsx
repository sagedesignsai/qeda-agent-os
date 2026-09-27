/**
 * lib/pdf-studio/primitives/RenderBlock.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispatcher component that renders the appropriate primitive for a PdfBlock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View } from '@react-pdf/renderer';
import type { PdfBlock, DocumentTheme } from '../types';
import type { PdfStyles } from '../styles';
import { RenderHeading } from './RenderHeading';
import { RenderParagraph } from './RenderParagraph';
import { RenderColumns } from './RenderColumns';
import { RenderTable } from './RenderTable';
import { RenderCallout } from './RenderCallout';
import { RenderMetrics } from './RenderMetrics';
import { RenderDivider } from './RenderDivider';
import { RenderSignature } from './RenderSignature';
import { RenderImageBlock } from './RenderImageBlock';

interface RenderBlockProps {
  block: PdfBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderBlock({ block, styles, theme }: RenderBlockProps) {
  switch (block.type) {
    case 'heading':
      return <RenderHeading block={block} styles={styles} theme={theme} />;
    case 'paragraph':
      return <RenderParagraph block={block} styles={styles} theme={theme} />;
    case 'columns':
      return <RenderColumns block={block} styles={styles} theme={theme} />;
    case 'table':
      return <RenderTable block={block} styles={styles} theme={theme} />;
    case 'callout':
      return <RenderCallout block={block} styles={styles} theme={theme} />;
    case 'metrics':
      return <RenderMetrics block={block} styles={styles} />;
    case 'divider':
      return <RenderDivider block={block} theme={theme} />;
    case 'page-break':
      return <View break />;
    case 'signature':
      return <RenderSignature block={block} styles={styles} theme={theme} />;
    case 'image':
      return <RenderImageBlock block={block} styles={styles} />;
    default:
      return null;
  }
}
