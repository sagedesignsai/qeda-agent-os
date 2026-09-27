/**
 * lib/pdf-studio/primitives/RenderColumns.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-column layout primitive with customizable width ratios and child blocks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import type { ColumnsBlock, DocumentTheme } from '../types';
import type { PdfStyles } from '../styles';
import { RenderBlock } from './RenderBlock';

interface RenderColumnsProps {
  block: ColumnsBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderColumns({ block, styles, theme }: RenderColumnsProps) {
  return (
    <View
      wrap={block.wrap ?? true}
      break={block.breakBefore ?? false}
      style={[
        styles.columnsRow,
        {
          gap: block.gap || 12,
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      {block.columns.map((col) => (
        <View
          key={col.id}
          style={[styles.columnItem, { flex: col.widthRatio || 1 }]}
        >
          {col.title && <Text style={styles.columnTitle}>{col.title}</Text>}
          {col.blocks.map((childBlock) => (
            <RenderBlock
              key={childBlock.id}
              block={childBlock}
              styles={styles}
              theme={theme}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
