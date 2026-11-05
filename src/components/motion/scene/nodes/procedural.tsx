import { useMemo } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Matrix4, Vector3, Quaternion } from 'three';

import type { MotionNode } from '@/lib/motion/types';

import { mulberry32 } from '@/lib/motion/random';
import { numberProp, stringProp } from './helpers';

function geometryFor(primitive: string) {
  switch (primitive) {
    case 'sphere': return new SphereGeometry(1, 16, 16);
    case 'cylinder': return new CylinderGeometry(1, 1, 1, 16);
    case 'torus': return new TorusGeometry(1, 0.35, 8, 24);
    case 'cone': return new ConeGeometry(1, 1, 16);
    default: return new BoxGeometry(1, 1, 1);
  }
}

function buildMatrices(node: MotionNode): Float32Array {
  const primitive = stringProp(node, 'primitive', 'box');
  const count = Math.min(5000, numberProp(node, 'count', 8));
  const size = numberProp(node, 'size', 0.3);
  const seed = numberProp(node, 'seed', 1);
  const rng = mulberry32(seed);
  const matrices: number[] = [];
  const type = node.type;
  const m = new Matrix4();
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3(size, size, size);

  if (type === 'procedural.array') {
    const spacing = numberProp(node, 'spacing', 0.8);
    for (let i = 0; i < count; i++) {
      pos.set((i - (count - 1) / 2) * spacing, 0, 0);
      m.compose(pos, quat, scl);
      for (let k = 0; k < 16; k++) matrices.push(m.elements[k]);
    }
  } else if (type === 'procedural.radial') {
    const radius = numberProp(node, 'radius', 1.5);
    const turns = numberProp(node, 'turns', 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 * turns;
      pos.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      m.compose(pos, quat, scl);
      for (let k = 0; k < 16; k++) matrices.push(m.elements[k]);
    }
  } else if (type === 'procedural.grid') {
    const rows = numberProp(node, 'rows', 5);
    const columns = numberProp(node, 'columns', 5);
    const spacing = numberProp(node, 'spacing', 0.8);
    const n = Math.min(count, rows * columns);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / columns);
      const c = i % columns;
      pos.set((c - (columns - 1) / 2) * spacing, 0, (r - (rows - 1) / 2) * spacing);
      m.compose(pos, quat, scl);
      for (let k = 0; k < 16; k++) matrices.push(m.elements[k]);
    }
  } else if (type === 'procedural.scatter') {
    const spread = numberProp(node, 'spread', 3);
    const jitter = numberProp(node, 'jitter', 0.6);
    for (let i = 0; i < count; i++) {
      pos.set((rng() - 0.5) * spread, (rng() - 0.5) * spread * jitter, (rng() - 0.5) * spread);
      const s = size * (0.5 + rng() * 0.8);
      scl.set(s, s, s);
      m.compose(pos, quat, scl);
      for (let k = 0; k < 16; k++) matrices.push(m.elements[k]);
    }
  } else if (type === 'procedural.curve') {
    const curve = stringProp(node, 'curve', 'helix');
    const radius = numberProp(node, 'radius', 1.4);
    const height = numberProp(node, 'height', 2);
    const turns = numberProp(node, 'turns', 3);
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      if (curve === 'helix') {
        const a = t * Math.PI * 2 * turns;
        pos.set(Math.cos(a) * radius, (t - 0.5) * height, Math.sin(a) * radius);
      } else if (curve === 'arc') {
        const a = t * Math.PI * turns;
        pos.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      } else {
        pos.set((t - 0.5) * radius * 2, Math.sin(t * Math.PI * 2 * turns) * (height / 2), 0);
      }
      m.compose(pos, quat, scl);
      for (let k = 0; k < 16; k++) matrices.push(m.elements[k]);
    }
  }
  return new Float32Array(matrices);
}

export function ProceduralRenderer({ node }: { node: MotionNode }) {
  const primitive = stringProp(node, 'primitive', 'box');
  const color = stringProp(node, 'color', '#5885f7');
  const roughness = numberProp(node, 'roughness', 0.5);
  const metalness = numberProp(node, 'metalness', 0);
  const opacity = numberProp(node, 'opacity', 1);
  const count = Math.min(5000, numberProp(node, 'count', 8));
  const geometry = useMemo(() => geometryFor(primitive), [primitive]);
  const matrices = useMemo(() => buildMatrices(node), [node]);
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, undefined as any, count);
    const mat = new MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity });
    m.material = mat;
    for (let i = 0; i < count; i++) {
      const mat4 = new Matrix4();
      for (let k = 0; k < 16; k++) mat4.elements[k] = matrices[i * 16 + k];
      m.setMatrixAt(i, mat4);
    }
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [geometry, matrices, count, color, roughness, metalness, opacity]);
  return <primitive object={mesh} />;
}