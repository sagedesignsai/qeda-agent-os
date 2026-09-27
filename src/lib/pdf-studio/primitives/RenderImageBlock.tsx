/**
 * lib/pdf-studio/primitives/RenderImageBlock.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Image block primitive with alignment and caption support.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text, Image } from '@react-pdf/renderer';
import type { ImageBlock } from '../types';
import type { PdfStyles } from '../styles';

interface RenderImageBlockProps {
  block: ImageBlock;
  styles: PdfStyles;
}

export function RenderImageBlock({ block, styles }: RenderImageBlockProps) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.marginTop ?? 0,
        marginBottom: block.marginBottom ?? 8,
        alignItems:
          block.align === 'center'
            ? 'center'
            : block.align === 'right'
              ? 'flex-end'
              : 'flex-start',
      }}
    >
      <Image
        src={block.src}
        style={{
          width: block.width || 200,
          height: block.height || 120,
          objectFit: 'contain',
        }}
      />
      {block.caption && (
        <Text
          style={[
            styles.paragraph,
            { fontSize: 8, color: '#64748b', marginTop: 2 },
          ]}
        >
          {block.caption}
        </Text>
      )}
    </View>
  );
}
