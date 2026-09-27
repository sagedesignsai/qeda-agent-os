/**
 * lib/pdf-studio/primitives/DocumentHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Running header component rendered on all pages (fixed={true}).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { DocumentHeaderConfig } from '../types';
import type { PdfStyles } from '../styles';

interface DocumentHeaderProps {
  header: DocumentHeaderConfig;
  styles: PdfStyles;
}

export function DocumentHeader({ header, styles }: DocumentHeaderProps) {
  if (!header.enabled) return null;

  return (
    <View fixed style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{header.leftText || ''}</Text>
        <Text style={styles.headerText}>{header.rightText || ''}</Text>
      </View>
      {header.showDivider !== false && <View style={styles.headerDivider} />}
    </View>
  );
}
