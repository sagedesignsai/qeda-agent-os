/**
 * components/motion/scene/nodes/product.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Procedural merchandise bindings. Everything is built from the node's props so
 * a merch scene stays editable without a modelling pass; the optional print
 * texture resolves from the document, never the editor store, so export matches
 * the viewport. Opacity is left to the frame binding.
 */

import { useMemo } from 'react';
import { DoubleSide, Shape, Vector2 } from 'three';

import type { MotionDocument, MotionNode } from '@/lib/motion/types';

import { useMotionAssetTexture } from './asset-texture';
import {
  boolProp,
  numberProp,
  stringProp,
  textureAspect,
} from './helpers';

function logoAssetId(node: MotionNode): string | undefined {
  const value = node.props.imageAssetId;
  return typeof value === 'string' && value ? value : undefined;
}

function PrintDecal({
  node,
  document,
  width,
  position,
}: {
  node: MotionNode;
  document: MotionDocument;
  width: number;
  position: [number, number, number];
}) {
  const texture = useMotionAssetTexture(document, logoAssetId(node));
  if (!texture) return null;
  const aspect = textureAspect(texture) ?? 1;
  return (
    <mesh position={position}>
      <planeGeometry args={[width, width / aspect]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.35} toneMapped={false} />
    </mesh>
  );
}

export function MugRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const height = numberProp(node, 'height', 0.95);
  const radius = numberProp(node, 'radius', 0.42);
  const color = stringProp(node, 'color', '#fdfcf8');
  const accent = stringProp(node, 'accentColor', '#e4e0d6');
  const roughness = numberProp(node, 'roughness', 0.36);
  const metalness = numberProp(node, 'metalness', 0);
  const handle = boolProp(node, 'handle', true);
  const printSize = radius * 2 * numberProp(node, 'logoScale', 0.5);

  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.93, height, 48, 1, true]} />
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, height / 2 - 0.008, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, radius * 0.055, 12, 48]} />
        <meshStandardMaterial color={accent} roughness={roughness} metalness={metalness} />
      </mesh>
      <mesh position={[0, -height / 2 + 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[radius * 0.93, radius * 0.93, 0.04, 48]} />
        <meshStandardMaterial color={accent} roughness={roughness} metalness={metalness} />
      </mesh>
      {handle && (
        <mesh position={[radius * 0.96, 0, 0]} rotation={[0, 0, -0.16]} castShadow>
          <torusGeometry args={[radius * 0.56, radius * 0.115, 14, 40, Math.PI * 1.35]} />
          <meshStandardMaterial color={accent} roughness={roughness} metalness={metalness} />
        </mesh>
      )}
      <PrintDecal
        node={node}
        document={document}
        width={printSize}
        position={[0, height * 0.04, radius + 0.004]}
      />
    </group>
  );
}

function bottleProfile(height: number, radius: number): Vector2[] {
  const half = height / 2;
  return [
    [0, -half],
    [radius * 0.88, -half],
    [radius, -half + radius * 0.16],
    [radius, -half * 0.2],
    [radius * 0.88, half * 0.16],
    [radius * 0.54, half * 0.42],
    [radius * 0.38, half * 0.58],
    [radius * 0.38, half * 0.86],
    [radius * 0.43, half * 0.93],
    [radius * 0.43, half],
  ].map(([x, y]) => new Vector2(x, y));
}

export function BottleRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const height = numberProp(node, 'height', 1.7);
  const radius = numberProp(node, 'radius', 0.3);
  const color = stringProp(node, 'color', '#5f7d6d');
  const capColor = stringProp(node, 'capColor', '#e9e4d8');
  const labelColor = stringProp(node, 'labelColor', '#f4f0e6');
  const roughness = numberProp(node, 'roughness', 0.24);
  const metalness = numberProp(node, 'metalness', 0.08);
  const profile = useMemo(() => bottleProfile(height, radius), [height, radius]);
  const capHeight = height * 0.09;
  const labelHeight = height * 0.32;
  const labelY = -height * 0.08;

  return (
    <group>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 48]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      <mesh position={[0, height / 2 + capHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.46, radius * 0.46, capHeight, 32]} />
        <meshStandardMaterial color={capColor} roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh position={[0, labelY, 0]}>
        <cylinderGeometry args={[radius + 0.008, radius + 0.008, labelHeight, 48, 1, true]} />
        <meshStandardMaterial color={labelColor} roughness={0.7} metalness={0} side={DoubleSide} />
      </mesh>
      <PrintDecal
        node={node}
        document={document}
        width={radius * 1.5 * numberProp(node, 'logoScale', 0.45) * 2}
        position={[0, labelY, radius + 0.014]}
      />
    </group>
  );
}

function teeShape(width: number, height: number) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const neck = halfWidth * 0.26;
  const shoulder = halfHeight * 0.72;
  const sleeve = halfWidth * 0.92;
  const body = halfWidth * 0.62;
  const shape = new Shape();

  // A tee is one closed outline; keeping the points literal is easier to read
  // than a chain of relative offsets.
  shape.moveTo(-neck, shoulder);
  shape.lineTo(-sleeve, halfHeight * 0.36);
  shape.lineTo(-halfWidth, halfHeight * 0.2);
  shape.lineTo(-halfWidth * 0.72, halfHeight * 0.02);
  shape.lineTo(-body, halfHeight * 0.2);
  shape.lineTo(-body, -halfHeight * 0.9);
  shape.quadraticCurveTo(-body, -halfHeight, -body + 0.08, -halfHeight);
  shape.lineTo(body - 0.08, -halfHeight);
  shape.quadraticCurveTo(body, -halfHeight, body, -halfHeight * 0.9);
  shape.lineTo(body, halfHeight * 0.2);
  shape.lineTo(halfWidth * 0.72, halfHeight * 0.02);
  shape.lineTo(halfWidth, halfHeight * 0.2);
  shape.lineTo(sleeve, halfHeight * 0.36);
  shape.lineTo(neck, shoulder);
  shape.quadraticCurveTo(0, shoulder - halfHeight * 0.18, -neck, shoulder);
  return shape;
}

export function ApparelRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const width = numberProp(node, 'width', 2.4);
  const height = numberProp(node, 'height', 2.8);
  const depth = numberProp(node, 'depth', 0.07);
  const color = stringProp(node, 'color', '#202836');
  const trim = stringProp(node, 'trimColor', '#33405a');
  const roughness = numberProp(node, 'roughness', 0.88);
  const metalness = numberProp(node, 'metalness', 0);
  const shape = useMemo(() => teeShape(width, height), [height, width]);
  const neck = width * 0.26;

  return (
    <group>
      <mesh position={[0, 0, -depth / 2]} castShadow receiveShadow>
        <extrudeGeometry
          args={[
            shape,
            {
              depth,
              bevelEnabled: true,
              bevelSegments: 2,
              bevelSize: 0.012,
              bevelThickness: 0.012,
              curveSegments: 12,
            },
          ]}
        />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      <mesh position={[0, height * 0.316, depth / 2 + 0.002]}>
        <torusGeometry args={[neck / 2, width * 0.011, 10, 40]} />
        <meshStandardMaterial color={trim} roughness={roughness} metalness={metalness} />
      </mesh>
      <PrintDecal
        node={node}
        document={document}
        width={width * numberProp(node, 'logoScale', 0.42)}
        position={[0, height * 0.06, depth / 2 + 0.012]}
      />
    </group>
  );
}

export function PackagingBoxRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const width = numberProp(node, 'width', 0.9);
  const height = numberProp(node, 'height', 0.9);
  const depth = numberProp(node, 'depth', 0.6);
  const color = stringProp(node, 'color', '#e8e3d7');
  const accent = stringProp(node, 'accentColor', '#2b3242');
  const roughness = numberProp(node, 'roughness', 0.62);
  const metalness = numberProp(node, 'metalness', 0.02);

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      <mesh position={[0, -height * 0.2, depth / 2 + 0.002]}>
        <planeGeometry args={[width * 0.74, height * 0.34]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.05} />
      </mesh>
      <PrintDecal
        node={node}
        document={document}
        width={width * numberProp(node, 'logoScale', 0.55)}
        position={[0, height * 0.16, depth / 2 + 0.006]}
      />
    </group>
  );
}

export function CanRenderer({ node, document }: { node: MotionNode; document: MotionDocument }) {
  const height = numberProp(node, 'height', 1.1);
  const radius = numberProp(node, 'radius', 0.3);
  const bodyColor = stringProp(node, 'bodyColor', '#c9d4e3');
  const accent = stringProp(node, 'accentColor', '#e33a2c');
  const metalness = numberProp(node, 'metalness', 0.9);
  const roughness = numberProp(node, 'roughness', 0.25);
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 48]} />
        <meshStandardMaterial color={bodyColor} metalness={metalness} roughness={roughness} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[radius + 0.001, radius + 0.001, height * 0.28, 48]} />
        <meshStandardMaterial color={accent} metalness={0.6} roughness={0.3} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 0.98, 0.04, 48]} />
        <meshStandardMaterial color="#bfc7d4" metalness={0.9} roughness={0.2} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}

export function JarRenderer({ node, document }: { node: MotionNode; document: MotionDocument }) {
  const height = numberProp(node, 'height', 0.7);
  const radius = numberProp(node, 'radius', 0.5);
  const lidHeight = numberProp(node, 'lidHeight', 0.12);
  const bodyColor = stringProp(node, 'bodyColor', '#f2efe9');
  const lidColor = stringProp(node, 'lidColor', '#c9bfae');
  const roughness = numberProp(node, 'roughness', 0.35);
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.92, height - lidHeight, 48]} />
        <meshStandardMaterial color={bodyColor} roughness={roughness} metalness={0} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, (height - lidHeight) / 2 + lidHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.02, radius * 1.02, lidHeight, 48]} />
        <meshStandardMaterial color={lidColor} roughness={0.5} metalness={0.1} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}

export function TubeRenderer({ node, document }: { node: MotionNode; document: MotionDocument }) {
  const height = numberProp(node, 'height', 1.0);
  const radius = numberProp(node, 'radius', 0.22);
  const capColor = stringProp(node, 'capColor', '#1b2230');
  const bodyColor = stringProp(node, 'bodyColor', '#e8eef8');
  const roughness = numberProp(node, 'roughness', 0.4);
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.95, height * 0.85, 32]} />
        <meshStandardMaterial color={bodyColor} roughness={roughness} metalness={0} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, height * 0.45, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.85, radius * 0.85, height * 0.1, 32]} />
        <meshStandardMaterial color={capColor} roughness={0.5} metalness={0.1} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}

export function PouchRenderer({ node, document }: { node: MotionNode; document: MotionDocument }) {
  const width = numberProp(node, 'width', 0.9);
  const height = numberProp(node, 'height', 1.3);
  const depth = numberProp(node, 'depth', 0.08);
  const bodyColor = stringProp(node, 'bodyColor', '#2a3344');
  const accent = stringProp(node, 'accentColor', '#5885f7');
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={bodyColor} roughness={0.7} metalness={0} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, height * 0.15, depth / 2 + 0.002]}>
        <planeGeometry args={[width * 0.7, height * 0.3]} />
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0.05} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}
