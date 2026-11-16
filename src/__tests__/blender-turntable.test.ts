/**
 * __tests__/blender-turntable.test.ts
 * Regression tests for `blender.asset.turntable`: the ops must validate and
 * produce a camera orbit — position.x/z keyframes on a circle, looping
 * timeline — sampled at quarter turns to prove a true camera orbit
 * (start +z, quarter x+, half −z, full loop back to start).
 */

import { createBlankMotionDocument } from '../lib/motion/defaults';
import { evaluateMotionFrame } from '../lib/motion/evaluate';
import { planMotionCommand } from '../lib/motion/engine-contract';
import type { MotionDocument } from '../lib/motion/types';
import {
  buildBlenderPlacementOps,
  buildTurntableOps,
} from '../main/tools/blender';

/** Blank doc with a staged chair asset placed at the origin. */
function docWithChair(): MotionDocument {
  const doc = createBlankMotionDocument({ id: 'doc_test', name: 'Test' });
  const plan = planMotionCommand(
    doc,
    buildBlenderPlacementOps({
      assetId: 'asset_chair1',
      path: 'assets/asset_chair1/source.glb',
      nodeName: 'Modern Minimalist Chair',
      nodeId: 'chair',
      bytes: 1234,
      hash: 'a'.repeat(64),
      metadata: { brief: 'modern minimalist chair with wooden legs' },
    }),
    { now: new Date().toISOString() },
  );
  return plan.preview;
}

function cameraPositionAt(doc: MotionDocument, time: number, cameraId: string) {
  const scene = doc.scenes.find((candidate) => candidate.id === doc.activeSceneId);
  const frame = evaluateMotionFrame(
    {
      id: doc.activeSceneId,
      nodes: doc.scene.nodes,
      timeline: doc.timeline,
      ...(scene ? { name: scene.name, cameraId: scene.cameraId } : {}),
    },
    time,
  );
  const camera = frame.nodes.find((node) => node.id === cameraId);
  expect(camera).toBeDefined();
  return camera!.transform.position;
}

describe('buildTurntableOps', () => {
  it('produces a looping camera orbit around the placed asset', () => {
    const doc = docWithChair();
    const built = buildTurntableOps(doc, { suffix: 'test1' });

    const plan = planMotionCommand(doc, built.ops, {
      now: new Date().toISOString(),
    });
    const next = plan.preview;

    expect(built.targetNodeId).toBe('chair');
    // Blank doc already has a camera ('camera') — it is reused, not duplicated.
    expect(built.cameraId).toBe('camera');
    expect(next.timeline.playMode).toBe('loop');
    expect(next.timeline.loop).toMatchObject({ enabled: true, start: 0 });
    expect(built.orbitDuration).toBe(doc.timeline.duration);

    // Orbit start: +z at radius 6, height 1.5 (defaults).
    expect(cameraPositionAt(next, 0, 'camera')).toEqual([0, 1.5, 6]);
    // Quarter turn: +x (and half: −z). Keys end at duration−0.01, so a
    // sample at duration/4 sits ~0.003 off the exact axis — tolerance 2.
    const quarter = cameraPositionAt(
      next,
      built.orbitDuration / 4,
      'camera',
    );
    expect(quarter[0]).toBeCloseTo(6, 1);
    expect(quarter[2]).toBeCloseTo(0, 1);
    const half = cameraPositionAt(next, built.orbitDuration / 2, 'camera');
    expect(half[0]).toBeCloseTo(0, 1);
    expect(half[2]).toBeCloseTo(-6, 1);
  });

  it('creates a camera when the scene has none', () => {
    const doc = docWithChair();
    // Remove the camera node directly (blank doc ships one).
    const withoutCamera: MotionDocument = {
      ...doc,
      scene: {
        nodes: doc.scene.nodes.filter((node) => node.id !== 'camera'),
      },
      scenes: doc.scenes.map((scene) => ({
        ...scene,
        nodes: scene.nodes.filter((node) => node.id !== 'camera'),
        cameraId: null,
      })),
    };

    const built = buildTurntableOps(withoutCamera, { suffix: 'test2' });
    const plan = planMotionCommand(withoutCamera, built.ops, {
      now: new Date().toISOString(),
    });

    expect(built.cameraId).toBe('turntable-camera-test2');
    expect(plan.preview.scenes[0].cameraId).toBe('turntable-camera-test2');
    expect(cameraPositionAt(plan.preview, 0, built.cameraId)).toEqual([
      0, 1.5, 6,
    ]);
  });

  it('honours an explicit nodeId, radius, and height', () => {
    const doc = docWithChair();
    const built = buildTurntableOps(doc, {
      nodeId: 'chair',
      radius: 4,
      height: 2,
      suffix: 'test3',
    });

    const plan = planMotionCommand(doc, built.ops, {
      now: new Date().toISOString(),
    });

    expect(cameraPositionAt(plan.preview, 0, 'camera')).toEqual([0, 2, 4]);
  });

  it('throws when there is no model node to orbit', () => {
    const doc = createBlankMotionDocument({ id: 'doc_empty', name: 'Empty' });
    expect(() => buildTurntableOps(doc)).toThrow(/No placed model\.gltf/);
    expect(() => buildTurntableOps(docWithChair(), { nodeId: 'nope' })).toThrow(
      /Node "nope" does not exist/,
    );
  });
});
