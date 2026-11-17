/**
 * __tests__/motion-camera-pose.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The camera rig's math, without WebGL. A recording camera stub checks the call
 * order (`lookAt` before rotation offsets, roll last) because that order is what
 * keeps legacy `aim: 'origin'` documents pixel-identical.
 */

jest.mock('three', () => ({
  Vector3: class Vector3 {
    x: number;
    y: number;
    z: number;

    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    add(other: { x: number; y: number; z: number }) {
      this.x += other.x;
      this.y += other.y;
      this.z += other.z;
      return this;
    }

    multiplyScalar(scale: number) {
      this.x *= scale;
      this.y *= scale;
      this.z *= scale;
      return this;
    }

    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    length() {
      return Math.sqrt(this.lengthSq());
    }

    distanceTo(other: { x: number; y: number; z: number }) {
      return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
    }
  },
}));

import {
  applyCameraPose,
  cameraAimOf,
  motionShakeOffset,
  resolveAimTarget,
  resolveFocusDistance,
} from '@/components/motion/scene/camera-pose';
import { createMotionNode } from '@/lib/motion/node-registry';
import type { MotionNode } from '@/lib/motion/types';

type Call = [string, ...number[]];

function cameraStub() {
  const calls: Call[] = [];
  const camera = {
    fov: 34,
    near: 0.1,
    far: 60,
    zoom: 1,
    position: {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
      add(other: { x: number; y: number; z: number }) {
        this.x += other.x;
        this.y += other.y;
        this.z += other.z;
      },
      length() {
        return Math.hypot(this.x, this.y, this.z);
      },
      distanceTo(other: { x: number; y: number; z: number }) {
        return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
      },
    },
    rotation: {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        calls.push(['rotation.set', x, y, z]);
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    lookAt(x: number, y: number, z: number) {
      calls.push(['lookAt', x, y, z]);
    },
    rotateX(value: number) {
      calls.push(['rotateX', value]);
    },
    rotateY(value: number) {
      calls.push(['rotateY', value]);
    },
    rotateZ(value: number) {
      calls.push(['rotateZ', value]);
    },
  };
  return { camera: camera as never, calls };
}

function cameraNode(props: Record<string, unknown>, position: [number, number, number] = [0, 0, 5]) {
  const node = createMotionNode('camera.perspective', 'camera');
  return {
    ...node,
    transform: { ...node.transform, position },
    props: { ...node.props, ...props },
  } satisfies MotionNode;
}

describe('camera rig', () => {
  it('treats a missing or unknown aim as origin', () => {
    expect(cameraAimOf(cameraNode({}))).toBe('origin');
    expect(cameraAimOf({ ...cameraNode({}), props: { aim: 'sideways' } })).toBe('origin');
    expect(cameraAimOf(cameraNode({ aim: 'target' }))).toBe('target');
    expect(cameraAimOf(cameraNode({ aim: 'free' }))).toBe('free');
  });

  it('keeps the legacy pose for aim: origin', () => {
    const { camera, calls } = cameraStub();
    applyCameraPose({
      camera,
      node: cameraNode({ aim: 'origin' }, [1, 2, 3]),
      viewMode: 'cinematic',
      zoom: 1,
      time: 0,
    });
    expect(calls).toEqual([
      ['lookAt', 0, 0, 0],
      ['rotateX', 0],
      ['rotateY', 0],
      ['rotateZ', 0],
    ]);
    expect((camera as unknown as { position: { x: number; y: number; z: number } }).position).toMatchObject({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it('aims at the resolved target, keeps the keyed rotation as an offset, then rolls', () => {
    const { camera, calls } = cameraStub();
    const node = cameraNode(
      { aim: 'target', roll: 90 },
      [0, 0, 4],
    );
    node.transform.rotation = [0.1, 0.2, 0.3];
    applyCameraPose({
      camera,
      node,
      viewMode: 'cinematic',
      zoom: 1,
      time: 0,
      aimTarget: { x: 0, y: 1, z: 0 } as never,
    });
    expect(calls[0]).toEqual(['lookAt', 0, 1, 0]);
    expect(calls.slice(1, 4)).toEqual([
      ['rotateX', 0.1],
      ['rotateY', 0.2],
      ['rotateZ', 0.3],
    ]);
    expect(calls[4]).toEqual(['rotateZ', Math.PI / 2]);
  });

  it('falls back to the origin when a target-aimed camera has no resolvable target', () => {
    const { camera, calls } = cameraStub();
    applyCameraPose({
      camera,
      node: cameraNode({ aim: 'target', targetId: 'missing' }),
      viewMode: 'cinematic',
      zoom: 1,
      time: 0,
      aimTarget: null,
    });
    expect(calls[0]).toEqual(['lookAt', 0, 0, 0]);
  });

  it('uses the keyed rotation as an absolute orientation in free mode', () => {
    const { camera, calls } = cameraStub();
    const node = cameraNode({ aim: 'free' });
    node.transform.rotation = [0.4, 0.5, 0.6];
    applyCameraPose({
      camera,
      node,
      viewMode: 'cinematic',
      zoom: 2,
      time: 0,
    });
    expect(calls[0]).toEqual(['rotation.set', 0.4, 0.5, 0.6]);
    expect((camera as unknown as { position: { z: number } }).position.z).toBe(2.5);
  });

  it('skips camera pose in editorial mode so OrbitControls can own the camera', () => {
    const { camera, calls } = cameraStub();
    applyCameraPose({
      camera,
      node: cameraNode({ roll: 45 }, [9, 9, 9]),
      viewMode: 'editorial',
      zoom: 2,
      time: 0,
    });
    // In editorial mode, applyCameraPose returns early — OrbitControls owns the camera
    expect(calls).toEqual([]);
  });

  it('adds a deterministic handheld offset without moving at zero strength', () => {
    const still = motionShakeOffset(2, 0, 1);
    expect(still.position.lengthSq()).toBe(0);
    expect(still.rotation.lengthSq()).toBe(0);

    const a = motionShakeOffset(2, 0.5, 1);
    const b = motionShakeOffset(2, 0.5, 1);
    const later = motionShakeOffset(3, 0.5, 1);
    expect(a.position).toMatchObject({ x: b.position.x, y: b.position.y, z: b.position.z });
    expect(a.position.x).not.toBe(later.position.x);
    expect(a.position.lengthSq()).toBeGreaterThan(0);

    const strong = motionShakeOffset(2, 1, 1);
    expect(strong.position.lengthSq()).toBeGreaterThan(a.position.lengthSq());
  });

  it('resolves an aim target with its offset, and nothing when the node is gone', () => {
    const groups = new Map([
      [
        'product',
        {
          getWorldPosition(target: { x: number; y: number; z: number }) {
            target.x = 1;
            target.y = 2;
            target.z = 3;
            return target;
          },
        },
      ],
    ]) as never;
    const node = cameraNode({ aim: 'target', targetId: 'product', targetOffset: [0, 1, -1] });
    const point = resolveAimTarget(node, groups);
    expect(point).toMatchObject({ x: 1, y: 3, z: 2 });
    expect(resolveAimTarget(node, new Map() as never)).toBeNull();
    expect(resolveAimTarget(cameraNode({ targetId: null }), groups)).toBeNull();
  });

  it('resolves focus distance from the authored value, the aim point, or the camera itself', () => {
    const camera = cameraStub().camera as unknown as {
      position: { length(): number; distanceTo(point: unknown): number };
    };
    const asCamera = camera as never;
    const node = cameraNode({ focusDistance: 0 });
    expect(resolveFocusDistance(cameraNode({ focusDistance: 4 }), null, asCamera)).toBe(4);
    expect(
      resolveFocusDistance(node, { x: 0, y: 0, z: 0 } as never, asCamera),
    ).toBeGreaterThan(0);
    expect(resolveFocusDistance(undefined, null, asCamera)).toBe(
      camera.position.length(),
    );
  });
});
