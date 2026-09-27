/**
 * lib/pdf-studio/primitives/RenderCallout.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Callout box renderer with variant accent borders and inline formatted text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { CalloutBlock, DocumentTheme } from '../types';
import type { PdfStyles } from '../styles';
import { renderInlineFormattedText } from '../inline-text';

interface RenderCalloutProps {
  block: CalloutBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderCallout({ block, styles, theme }: RenderCalloutProps) {
  const variantColor =
    block.variant === 'warning'
      ? '#d97706'
      : block.variant === 'success'
        ? '#059669'
        : block.variant === 'quote'
          ? theme.mutedColor
          : block.variant === 'note'
            ? theme.secondaryColor
            : theme.accentColor;

  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.calloutCard,
        {
          borderLeftColor: variantColor,
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      {block.title && (
        <Text style={[styles.calloutTitle, { color: variantColor }]}>
          {renderInlineFormattedText(block.title, theme)}
        </Text>
      )}
      <Text style={styles.calloutText}>
        {renderInlineFormattedText(block.text, theme)}
      </Text>
    </View>
  );
}
