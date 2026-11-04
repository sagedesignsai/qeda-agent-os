/**
 * components/motion/scene/nodes/text.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SDF text. Title and body share this component; typography (size, spacing,
 * line height, alignment, font asset) is read from props, and the authored font
 * size is stamped on the mesh so the frame binding can animate it by scaling.
 */

import { Text } from '@react-three/drei';

import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

import { numberProp, stringProp } from './helpers';

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!? '()-:&%";

export function TextNodeRenderer({ node, document }: { node: MotionNode; document: MotionDocument }) {
  const text = stringProp(node, 'text', '');
  const color = stringProp(node, 'color', '#ffffff');
  const fontSize = numberProp(node, 'fontSize', 0.3);
  const opacity = numberProp(node, 'opacity', 1);
  const align = stringProp(node, 'align', 'center') as 'left' | 'center' | 'right';
  const maxWidth = numberProp(node, 'maxWidth', 12);
  const letterSpacing = numberProp(node, 'letterSpacing', 0);
  const lineHeight = numberProp(node, 'lineHeight', 1);
  const fontAssetId = stringProp(node, 'fontAssetId', '');

  const fontAsset = fontAssetId
    ? document.assets.find((asset) => asset.id === fontAssetId)
    : undefined;
  const font = fontAsset ? motionAssetUrl(document.meta.id, fontAsset.id) : undefined;

  return (
    <Text
      fontSize={fontSize}
      // The frame binding animates text size by scaling around this authored size.
      userData={{ motionBaseFontSize: fontSize }}
      color={color}
      fillOpacity={opacity}
      letterSpacing={letterSpacing}
      lineHeight={lineHeight}
      maxWidth={maxWidth}
      textAlign={align}
      anchorX={align}
      anchorY="middle"
      outlineWidth={0}
      characters={GLYPHS}
      {...(font ? { font } : {})}
    >
      {text}
    </Text>
  );
}
