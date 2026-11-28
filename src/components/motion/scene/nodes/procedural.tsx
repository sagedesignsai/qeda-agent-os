import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Matrix4,
  Vector3,
  Quaternion,
} from 'three';

import type { MotionNode } from '@/lib/motion/types';

import { mulberry32 } from '@/lib/motion/random';
import type { MotionNodeTimeSource } from '../renderer-registry';
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

const GALAXY_VERTEX = `
attribute float aRatio;
attribute float aBranch;
attribute float aJitterR;
attribute float aJitterT;
attribute float aJitterY;
attribute float aSpark;
uniform float uTime;
uniform float uRate;
uniform float uSpin;
uniform float uRadius;
uniform float uPower;
uniform float uSize;
uniform float uRefDist;
uniform float uGlow;
uniform float uViewHeight;
uniform vec3 uCore;
uniform vec3 uRim;
varying vec3 vColor;
varying float vBright;
void main() {
  float ratio = clamp(aRatio, 0.0, 1.0);
  // Omega falls to zero at the rim, so the core laps the outer disc and the
  // arms wind up. Solved from time, never integrated frame to frame.
  float omega = 1.0 - ratio;
  float r = pow(ratio, uPower) * uRadius;
  float theta = aBranch + uSpin * r + uRate * uTime * omega;
  vec2 radial = vec2(cos(theta), sin(theta));
  vec2 tangent = vec2(-radial.y, radial.x);
  vec2 xz = radial * (r + aJitterR) + tangent * aJitterT;
  vec4 mv = modelViewMatrix * vec4(xz.x, aJitterY, xz.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float heightScale = max(uViewHeight, 1.0) / 1080.0;
  gl_PointSize = uSize * heightScale * (uRefDist / max(-mv.z, 0.001)) * (0.55 + 0.75 * aSpark);
  vColor = mix(uCore, uRim, pow(ratio, uPower));
  vBright = uGlow * (0.22 + 0.78 * exp(-ratio * 3.0));
}
`;

const GALAXY_FRAGMENT = `
uniform float uOpacity;
varying vec3 vColor;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * uOpacity;
  gl_FragColor = vec4(vColor * vBright, a);
}
`;

export function GalaxyRenderer({
  node,
  clock,
}: {
  node: MotionNode;
  clock: MotionNodeTimeSource;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const count = Math.min(200_000, Math.max(100, Math.round(numberProp(node, 'count', 12_000))));
  const radius = numberProp(node, 'radius', 4);
  const branches = Math.max(2, Math.min(8, Math.round(numberProp(node, 'branches', 3))));
  const spin = numberProp(node, 'spin', 0.8);
  const rate = numberProp(node, 'rate', 0.15);
  const sizeProp = numberProp(node, 'size', 2);
  const coreColor = stringProp(node, 'coreColor', '#ffd9a0');
  const rimColor = stringProp(node, 'rimColor', '#6aa8ff');
  const glow = numberProp(node, 'glow', 1.2);
  const seed = Math.round(numberProp(node, 'seed', 7));
  const materialRef = useRef<ShaderMaterial | null>(null);

  const geometry = useMemo(() => {
    const rng = mulberry32(seed);
    const ratios = new Float32Array(count);
    const branch = new Float32Array(count);
    const jitterR = new Float32Array(count);
    const jitterT = new Float32Array(count);
    const jitterY = new Float32Array(count);
    const spark = new Float32Array(count);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const ratio = Math.pow(rng(), 0.72);
      ratios[i] = ratio;
      branch[i] = ((i % branches) / branches) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const falloff = 0.06 + ratio * 0.22;
      jitterR[i] = (rng() - 0.5) * falloff * radius;
      jitterT[i] = (rng() - 0.5) * falloff * radius;
      jitterY[i] = (rng() - 0.5) * 0.12 * radius * (0.25 + (1 - ratio));
      spark[i] = rng();
    }
    const next = new BufferGeometry();
    // `position` exists because Three counts vertices from it; the vertex
    // shader derives the real position from the attributes above.
    next.setAttribute('position', new BufferAttribute(positions, 3));
    next.setAttribute('aRatio', new BufferAttribute(ratios, 1));
    next.setAttribute('aBranch', new BufferAttribute(branch, 1));
    next.setAttribute('aJitterR', new BufferAttribute(jitterR, 1));
    next.setAttribute('aJitterT', new BufferAttribute(jitterT, 1));
    next.setAttribute('aJitterY', new BufferAttribute(jitterY, 1));
    next.setAttribute('aSpark', new BufferAttribute(spark, 1));
    return next;
  }, [branches, count, radius, seed]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uRate: { value: rate },
          uSpin: { value: spin },
          uRadius: { value: radius },
          uPower: { value: 1.55 },
          uSize: { value: sizeProp },
          uRefDist: { value: 1 },
          uGlow: { value: glow },
          uViewHeight: { value: 1080 },
          uCore: { value: new Color(coreColor) },
          uRim: { value: new Color(rimColor) },
          uOpacity: { value: 1 },
        },
        vertexShader: GALAXY_VERTEX,
        fragmentShader: GALAXY_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      }),
    [coreColor, glow, radius, rate, rimColor, sizeProp, spin],
  );

  useEffect(() => {
    materialRef.current = material;
    return () => {
      materialRef.current = null;
      material.dispose();
    };
  }, [material]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const active = materialRef.current;
    if (!active) return;
    active.uniforms.uTime.value = clock.getTime();
    active.uniforms.uOpacity.value = numberProp(node, 'opacity', 0.95);
    active.uniforms.uRefDist.value = camera.position.length();
    active.uniforms.uViewHeight.value = size.height * gl.getPixelRatio();
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}