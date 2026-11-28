/**
 * components/motion/scene/nodes/text-extruded.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Beveled 3D typography. The bundled typeface JSON keeps the node offline-safe:
 * three's TTFLoader fetches its parser from a CDN, which is not acceptable in a
 * packaged Electron render window. Geometry is built per letter so tracking is
 * real spacing rather than a texture trick, and the whole word still scales as
 * one animated node.
 */

import { useEffect, useMemo, useState } from 'react';
import { Text } from '@react-three/drei';
import {
  BufferGeometry,
  MeshStandardMaterial,
} from 'three';

import type { MotionNode } from '@/lib/motion/types';
import { trackMotionAsset } from '@/lib/motion/asset-readiness';

import typeface from '@/assets/fonts/LiberationSans-Bold.typeface.json';

import { numberProp, stringProp } from './helpers';

type TypefaceGlyph = { ha?: number };
type TypefaceData = {
  glyphs: Record<string, TypefaceGlyph>;
  resolution: number;
};

type BuiltText = {
  letters: Array<{ geometry: BufferGeometry; x: number }>;
};

function finishMaterial(
  node: MotionNode,
  opacity: number,
): MeshStandardMaterial {
  const finish = stringProp(node, 'finish', 'chrome');
  const color = stringProp(node, 'color', '#e9ecf2');
  const metalness = numberProp(node, 'metalness', 1);
  const roughness = numberProp(node, 'roughness', 0.16);
  const preset =
    finish === 'gold'
      ? { color: '#e7bf6a', metalness: 1, roughness: 0.2, envMapIntensity: 1.4 }
      : finish === 'matte'
        ? { color, metalness: 0, roughness: 0.62, envMapIntensity: 0.8 }
        : finish === 'chrome'
          ? { color: '#e9ecf2', metalness: 1, roughness: 0.16, envMapIntensity: 1.6 }
          : { color, metalness, roughness, envMapIntensity: 1 };
  return new MeshStandardMaterial({
    ...preset,
    transparent: opacity < 1,
    opacity,
  });
}

export function ExtrudedTextRenderer({ node }: { node: MotionNode }) {
  const text = stringProp(node, 'text', 'NOVA');
  const fontSize = Math.max(0.01, numberProp(node, 'fontSize', 0.9));
  const depth = Math.max(0.01, numberProp(node, 'depth', 0.2));
  const bevelSize = Math.max(0, numberProp(node, 'bevelSize', 0.025));
  const bevelThickness = Math.max(0, numberProp(node, 'bevelThickness', 0.04));
  const tracking = numberProp(node, 'tracking', 0.04);
  const opacity = numberProp(node, 'opacity', 1);
  const [built, setBuilt] = useState<BuiltText | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBuilt(null);
    setFailed(false);
    void trackMotionAsset((async () => {
      const [{ FontLoader }, { TextGeometry: TextGeometryCtor }] = await Promise.all([
        import('three/examples/jsm/loaders/FontLoader.js'),
        import('three/examples/jsm/geometries/TextGeometry.js'),
      ]);
      const font = new FontLoader().parse(typeface as never);
      if (cancelled) return;
      const data = (font as unknown as { data?: TypefaceData }).data;
      if (!data?.glyphs) throw new Error('The 3D typeface has no glyph table.');
      const scale = fontSize / data.resolution;
      const letters: Array<{ geometry: BufferGeometry; x: number }> = [];
      let cursor = 0;
      for (const character of text.replace(/\s+/g, ' ').slice(0, 64)) {
        const glyph = data.glyphs[character] ?? data.glyphs['?'];
        const advance = (glyph?.ha ?? 600) * scale;
        if (character.trim()) {
          const geometry = new TextGeometryCtor(character, {
            font,
            size: fontSize,
            depth,
            curveSegments: 10,
            bevelEnabled: bevelSize > 0 || bevelThickness > 0,
            bevelThickness,
            bevelSize,
            bevelSegments: 3,
          });
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          if (box) {
            geometry.translate(
              -(box.min.x + box.max.x) / 2,
              -(box.min.y + box.max.y) / 2,
              -depth / 2,
            );
          }
          letters.push({ geometry, x: cursor + advance / 2 });
        }
        cursor += advance + tracking * fontSize;
      }
      const width = Math.max(0, cursor - tracking * fontSize);
      for (const letter of letters) letter.x -= width / 2;
      if (!cancelled) setBuilt({ letters });
    })()).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [bevelSize, bevelThickness, depth, fontSize, text, tracking]);

  useEffect(
    () => () => {
      for (const letter of built?.letters ?? []) letter.geometry.dispose();
    },
    [built],
  );

  const material = useMemo(
    () => finishMaterial(node, opacity),
    // Material props are read once per render; the frame binding applies opacity
    // to the shared material every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node.props.color, node.props.finish, node.props.metalness, node.props.roughness],
  );
  useEffect(() => () => material.dispose(), [material]);

  if (failed) {
    return (
      <Text
        fontSize={fontSize}
        color={stringProp(node, 'color', '#e9ecf2')}
        userData={{ motionBaseFontSize: fontSize }}
        anchorX="center"
        anchorY="middle"
      >
        {text}
      </Text>
    );
  }

  if (!built) return null;
  return (
    <group userData={{ motionBaseFontSize: fontSize }}>
      {built.letters.map((letter, index) => (
        <mesh
          key={index}
          geometry={letter.geometry}
          material={material}
          position={[letter.x, 0, 0]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}