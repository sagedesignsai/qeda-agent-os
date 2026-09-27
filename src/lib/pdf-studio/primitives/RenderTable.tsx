/**
 * lib/pdf-studio/primitives/RenderTable.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured table renderer with headers, striped rows, and inline text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { TableBlock, DocumentTheme } from '../types';
import type { PdfStyles } from '../styles';
import { renderInlineFormattedText } from '../inline-text';

interface RenderTableProps {
  block: TableBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderTable({ block, styles, theme }: RenderTableProps) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.tableWrapper,
        {
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 10,
          borderColor:
            block.showBorders === false ? 'transparent' : theme.borderColor,
        },
      ]}
    >
      {/* Table Header */}
      <View
        style={[
          styles.tableRow,
          styles.tableHeaderRow,
          block.headerBg ? { backgroundColor: block.headerBg } : {},
        ]}
      >
        {block.columns.map((col) => (
          <View
            key={col.id}
            style={[
              styles.tableCell,
              {
                width: `${col.widthPct}%`,
                textAlign: col.align || 'left',
              },
            ]}
          >
            <Text style={styles.tableHeaderText}>{col.header}</Text>
          </View>
        ))}
      </View>

      {/* Table Rows */}
      {block.rows.map((row, rIdx) => {
        const isStripe = block.striped && rIdx % 2 === 1;
        return (
          <View
            key={`row-${rIdx}`}
            style={[
              styles.tableRow,
              isStripe ? { backgroundColor: theme.surfaceColor } : {},
              rIdx < block.rows.length - 1 && block.showBorders !== false
                ? {
                    borderBottomWidth: 0.5,
                    borderBottomColor: theme.borderColor,
                  }
                : {},
            ]}
          >
            {block.columns.map((col, cIdx) => (
              <View
                key={`cell-${rIdx}-${cIdx}`}
                style={[
                  styles.tableCell,
                  {
                    width: `${col.widthPct}%`,
                    textAlign: col.align || 'left',
                  },
                ]}
              >
                <Text style={styles.tableCellText}>
                  {renderInlineFormattedText(row[cIdx] ?? '', theme)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
