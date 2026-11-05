import { Text } from '@react-three/drei';
import { useMemo } from 'react';
import { DoubleSide, RingGeometry, Shape } from 'three';

import type { MotionNode } from '@/lib/motion/types';

import { getMotionAnimatedPropApplier, registerMotionAnimatedPropApplier } from '../animated-props';
import { numberProp, stringProp } from './helpers';

function rectShape(w: number, h: number, r: number) {
  const halfW = w / 2, halfH = h / 2, rr = Math.min(r, halfW, halfH);
  const s = new Shape();
  s.moveTo(-halfW + rr, -halfH);
  s.lineTo(halfW - rr, -halfH);
  s.quadraticCurveTo(halfW, -halfH, halfW, -halfH + rr);
  s.lineTo(halfW, halfH - rr);
  s.quadraticCurveTo(halfW, halfH, halfW - rr, halfH);
  s.lineTo(-halfW + rr, halfH);
  s.quadraticCurveTo(-halfW, halfH, -halfW, halfH - rr);
  s.lineTo(-halfW, -halfH + rr);
  s.quadraticCurveTo(-halfW, -halfH, -halfW + rr, -halfH);
  return s;
}

export function LineRenderer({ node }: { node: MotionNode }) {
  const length = numberProp(node, 'length', 4);
  const thickness = numberProp(node, 'thickness', 0.02);
  const color = stringProp(node, 'color', '#ffffff');
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <mesh>
      <planeGeometry args={[length, thickness]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </mesh>
  );
}

export function ArrowRenderer({ node }: { node: MotionNode }) {
  const length = numberProp(node, 'length', 1.6);
  const thickness = numberProp(node, 'thickness', 0.03);
  const headSize = numberProp(node, 'headSize', 0.18);
  const color = stringProp(node, 'color', '#ffffff');
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh position={[-headSize / 2, 0, 0]}>
        <planeGeometry args={[length - headSize, thickness]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh position={[length / 2 - headSize / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[headSize / 2, headSize, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function BadgeRenderer({ node }: { node: MotionNode }) {
  const text = stringProp(node, 'text', 'NEW');
  const fontSize = numberProp(node, 'fontSize', 0.16);
  const padX = numberProp(node, 'paddingX', 0.16);
  const padY = numberProp(node, 'paddingY', 0.07);
  const cornerRadius = numberProp(node, 'cornerRadius', 0.2);
  const bg = stringProp(node, 'background', '#5885f7');
  const color = stringProp(node, 'color', '#ffffff');
  const opacity = numberProp(node, 'opacity', 1);
  const w = Math.max(0.4, text.length * fontSize * 0.62 + padX * 2);
  const h = fontSize + padY * 2;
  const shape = useMemo(() => rectShape(w, h, cornerRadius), [w, h, cornerRadius]);
  return (
    <group>
      <mesh>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={bg} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <Text fontSize={fontSize} color={color} anchorX="center" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
        {text}
      </Text>
    </group>
  );
}

export function LowerThirdRenderer({ node }: { node: MotionNode }) {
  const name = stringProp(node, 'name', 'Jane Doe');
  const title = stringProp(node, 'title', 'Head of Product');
  const width = numberProp(node, 'width', 4.2);
  const height = numberProp(node, 'height', 0.9);
  const accent = stringProp(node, 'accentColor', '#5885f7');
  const bg = stringProp(node, 'background', '#0e131c');
  const color = stringProp(node, 'color', '#ffffff');
  const titleColor = stringProp(node, 'titleColor', '#9fb0c9');
  const opacity = numberProp(node, 'opacity', 1);
  const shape = useMemo(() => rectShape(width, height, 0.08), [width, height]);
  return (
    <group>
      <mesh>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={bg} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh position={[-width / 2 + 0.06, 0, 0.001]}>
        <planeGeometry args={[0.06, height * 0.7]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <Text position={[-width / 2 + 0.22, height * 0.12, 0.002]} fontSize={height * 0.28} color={color} anchorX="left" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
        {name}
      </Text>
      <Text position={[-width / 2 + 0.22, -height * 0.18, 0.002]} fontSize={height * 0.2} color={titleColor} anchorX="left" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
        {title}
      </Text>
    </group>
  );
}

export function ProgressRingRenderer({ node }: { node: MotionNode }) {
  const progress = numberProp(node, 'progress', 0.72);
  const radius = numberProp(node, 'radius', 0.9);
  const thickness = numberProp(node, 'thickness', 0.12);
  const color = stringProp(node, 'color', '#5885f7');
  const track = stringProp(node, 'trackColor', '#1b2230');
  const opacity = numberProp(node, 'opacity', 1);
  // applier: update thetaLength on the progress mesh
  return (
    <group userData={{ motionRole: 'ring', progress, radius, thickness }}>
      <mesh>
        <ringGeometry args={[radius - thickness, radius, 64, 1, 0, Math.PI * 2]} />
        <meshBasicMaterial color={track} transparent opacity={opacity * 0.4} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh userData={{ motionRole: 'progress' }}>
        <ringGeometry args={[radius - thickness, radius, 64, 1, -Math.PI / 2, Math.PI * 2 * progress]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

// register applier for progress-ring
registerMotionAnimatedPropApplier('graphic.progress-ring', (group, node) => {
  const progress = numberProp(node, 'progress', 0.72);
  const radius = numberProp(node, 'radius', 0.9);
  const thickness = numberProp(node, 'thickness', 0.12);
  const child = group.children[1] as any;
  if (child?.geometry) {
    child.geometry.dispose();
    (child as any).geometry = new RingGeometry(radius - thickness, radius, 64, 1, -Math.PI / 2, Math.PI * 2 * Math.max(0, Math.min(1, progress)));
  }
});

export function WaveformRenderer({ node }: { node: MotionNode }) {
  const values = (node.props.values as number[]) ?? [];
  const bars = numberProp(node, 'bars', 32);
  const height = numberProp(node, 'height', 0.9);
  const width = numberProp(node, 'width', 3.6);
  const color = stringProp(node, 'color', '#59c7a6');
  const gap = numberProp(node, 'gap', 0.03);
  const opacity = numberProp(node, 'opacity', 1);
  const mirrored = !!node.props.mirrored;
  const barW = (width - gap * (bars - 1)) / bars;
  const heights = Array.from({ length: bars }, (_, i) => {
    const v = values[i % Math.max(1, values.length)] ?? 0;
    return Math.min(height, Math.abs(v) * height);
  });
  return (
    <group>
      {heights.map((h, i) => (
        <mesh key={i} position={[-width / 2 + barW / 2 + i * (barW + gap), (mirrored ? 0 : h / 2), 0]}>
          <boxGeometry args={[barW, Math.max(0.001, h), 0.02]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function TickerRenderer({ node }: { node: MotionNode }) {
  const text = stringProp(node, 'text', '');
  const fontSize = numberProp(node, 'fontSize', 0.18);
  const height = numberProp(node, 'height', 0.4);
  const bg = stringProp(node, 'background', '#0e131c');
  const color = stringProp(node, 'color', '#ffffff');
  const opacity = numberProp(node, 'opacity', 1);
  const width = Math.max(4, text.length * fontSize * 0.55);
  return (
    <group>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={bg} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <Text fontSize={fontSize} color={color} anchorX="left" anchorY="middle" position={[-width / 2 + 0.1, 0, 0.001]} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
        {text}
      </Text>
    </group>
  );
}
