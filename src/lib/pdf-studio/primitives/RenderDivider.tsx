/**
 * lib/pdf-studio/primitives/RenderDivider.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Horizontal rule/divider primitive (solid, dashed, dotted).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View } from '@react-pdf/renderer';
import type { DividerBlock, DocumentTheme } from '../types';

interface RenderDividerProps {
  block: DividerBlock;
  theme: DocumentTheme;
}

export function RenderDivider({ block, theme }: RenderDividerProps) {
  return (
    <View
      wrap={false}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.spacing ?? 8,
        marginBottom: block.spacing ?? 8,
        borderBottomWidth: block.thickness ?? 0.5,
        borderBottomColor: block.color || theme.borderColor,
        borderBottomStyle: block.style || 'solid',
      }}
    />
  );
}
