/**
 * lib/pdf-studio/primitives/DocumentFooter.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Running footer component with dynamic page numbering (Page X of Y).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { DocumentFooterConfig } from '../types';
import type { PdfStyles } from '../styles';

interface DocumentFooterProps {
  footer: DocumentFooterConfig;
  styles: PdfStyles;
}

export function DocumentFooter({ footer, styles }: DocumentFooterProps) {
  if (!footer.enabled) return null;

  return (
    <View fixed style={styles.footerContainer}>
      {footer.showDivider !== false && <View style={styles.footerDivider} />}
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{footer.leftText || ''}</Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }: any) => {
            if (footer.pageNumberFormat === 'simple') {
              return `${pageNumber}`;
            }
            return `Page ${pageNumber} of ${totalPages}`;
          }}
        />
        <Text style={styles.footerText}>{footer.rightText || ''}</Text>
      </View>
    </View>
  );
}
