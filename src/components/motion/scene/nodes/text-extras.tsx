import { Text } from '@react-three/drei';

import type { MotionNode } from '@/lib/motion/types';

import { numberProp, stringProp } from './helpers';

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/";

export function CaptionRenderer({ node }: { node: MotionNode }) {
  const text = stringProp(node, 'text', '');
  const fontSize = numberProp(node, 'fontSize', 0.14);
  const color = stringProp(node, 'color', '#ffffff');
  const opacity = numberProp(node, 'opacity', 1);
  const bg = stringProp(node, 'background', '#0e131c');
  const padX = numberProp(node, 'paddingX', 0.18);
  const padY = numberProp(node, 'paddingY', 0.08);
  const cornerRadius = numberProp(node, 'cornerRadius', 0.06);
  const w = Math.max(0.4, text.length * fontSize * 0.55 + padX * 2);
  const h = fontSize + padY * 2;
  return (
    <group>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={bg} transparent opacity={opacity * 0.85} toneMapped={false} />
      </mesh>
      <Text fontSize={fontSize} color={color} anchorX="center" anchorY="middle" characters={GLYPHS} fillOpacity={opacity}>
        {text}
      </Text>
    </group>
  );
}

export function QuoteRenderer({ node }: { node: MotionNode }) {
  const text = stringProp(node, 'text', '');
  const attribution = stringProp(node, 'attribution', '');
  const fontSize = numberProp(node, 'fontSize', 0.22);
  const quoteColor = stringProp(node, 'quoteColor', '#ffffff');
  const attributionColor = stringProp(node, 'attributionColor', '#9fb0c9');
  const opacity = numberProp(node, 'opacity', 1);
  const maxWidth = numberProp(node, 'maxWidth', 10);
  return (
    <group>
      <Text fontSize={fontSize} color={quoteColor} anchorX="center" anchorY="middle" maxWidth={maxWidth} textAlign="center" fillOpacity={opacity} characters={GLYPHS}>
        {text}
      </Text>
      {attribution && (
        <Text fontSize={fontSize * 0.5} color={attributionColor} anchorX="center" anchorY="middle" position={[0, -fontSize * 1.2, 0]} characters={GLYPHS}>
          {attribution}
        </Text>
      )}
    </group>
  );
}