/**
 * lib/pdf-studio/primitives/RenderSignature.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Document signature line with signee name, title, company, and date.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { SignatureBlock, DocumentTheme } from '../types';
import type { PdfStyles } from '../styles';
import { renderInlineFormattedText } from '../inline-text';

interface RenderSignatureProps {
  block: SignatureBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderSignature({
  block,
  styles,
  theme,
}: RenderSignatureProps) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.signatureContainer,
        {
          marginTop: block.marginTop ?? 12,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      <View style={styles.signatureLine} />
      <Text style={styles.signeeName}>
        {renderInlineFormattedText(block.signeeName, theme)}
      </Text>
      {block.role && (
        <Text style={styles.signatureMeta}>
          {renderInlineFormattedText(block.role, theme)}
        </Text>
      )}
      {block.company && (
        <Text style={styles.signatureMeta}>
          {renderInlineFormattedText(block.company, theme)}
        </Text>
      )}
      {block.date && <Text style={styles.signatureMeta}>{block.date}</Text>}
    </View>
  );
}
