/**
 * __tests__/motion-moves.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Camera moves must compile to ordinary ops and produce a document that
 * validates, samples and round-trips like hand-authored animation.
 */

import { createBlankMotionDocument } from '@/lib/motion/defaults';
import { evaluateMotionFrame } from '@/lib/motion/evaluate';
import type { MotionEntityKind } from '@/lib/motion/ids';
import { expandCameraMove, listCameraMoves } from '@/lib/motion/moves';
import { createMotionNode } from '@/lib/motion/node-registry';
import { applyMotionOps } from '@/lib/motion/ops';
import { motionWorldPosition } from '@/lib/motion/transforms';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

function ids() {
  let index = 0;
  return (kind: MotionEntityKind) => `${kind}_${(index += 1)}`;
}

function activeScene(doc: MotionDocument) {
  return doc.scenes.find((scene) => scene.id === doc.activeSceneId) ?? doc.scenes[0];
}

function evaluate(doc: MotionDocument, time: number) {
  return evaluateMotionFrame(
    { id: doc.activeSceneId, nodes: activeScene(doc).nodes, timeline: doc.timeline },
    time,
  );
}

function cameraOf(doc: MotionDocument): MotionNode {
  const node = doc.scene.nodes.find((candidate) => candidate.type === 'camera.perspective');
  if (!node) throw new Error('test document has no camera');
  return node;
}

function applyMove(doc: MotionDocument, id: string, extra: { targetId?: string } = {}) {
  return applyMotionOps(
    doc,
    expandCameraMove(
      id,
      {
        cameraId: 'camera',
        from: cameraOf(doc).transform,
        start: 0,
        duration: 2,
        ...extra,
      },
      ids(),
    ),
  );
}

describe('camera moves', () => {
  it('lists the motion vocabulary with descriptions', () => {
    const moves = listCameraMoves();
    expect(moves.map((move) => move.id)).toEqual([
      'push-in',
      'pull-out',
      'orbit-left',
      'orbit-right',
      'crane-up',
      'handheld',
    ]);
    expect(moves.every((move) => move.description.length > 10)).toBe(true);
  });

  it('compiles a push-in to a track, clip, placement and position keys', () => {
    const doc = createBlankMotionDocument();
    const from = cameraOf(doc).transform.position;
    const moved = applyMove(doc, 'push-in');

    expect(moved.timeline.tracks.some((track) => track.targetId === 'camera')).toBe(true);
    expect(moved.timeline.clips.some((clip) => clip.channels.some(
      (channel) => channel.targetId === 'camera' && channel.property === 'position.z',
    ))).toBe(true);

    const camera = evaluate(moved, 1).nodes.find((node) => node.id === 'camera');
    expect(camera).toBeDefined();
    expect(camera!.transform.position[2]).toBeLessThan(from[2]);
  });

  it('orbits around the subject at a constant radius', () => {
    const doc = createBlankMotionDocument();
    const from = cameraOf(doc).transform.position;
    const moved = applyMove(doc, 'orbit-right');
    // Compare the endpoints: linear interpolation between two arc points cuts
    // the chord mid-move, so only the arrival pose stays on the circle.
    const camera = evaluate(moved, 1.999).nodes.find((node) => node.id === 'camera')!;
    const [x, , z] = camera.transform.position;
    expect(Math.hypot(x, z)).toBeCloseTo(Math.hypot(from[0], from[2]), 5);
    const delta = Math.atan2(x, z) - Math.atan2(from[0], from[2]);
    expect(delta).toBeCloseTo(Math.PI / 6, 2);
  });

  it('adds handheld as a rig property instead of keyframes', () => {
    const doc = createBlankMotionDocument();
    const moved = applyMove(doc, 'handheld');
    expect(moved.timeline.tracks).toHaveLength(doc.timeline.tracks.length);
    const camera = cameraOf(moved);
    expect(camera.props.shake).toBeCloseTo(0.4, 5);
    expect(camera.props.shakeSpeed).toBe(1.1);
  });

  it('locks aim onto a target when the move is given one', () => {
    const doc = createBlankMotionDocument();
    const moved = applyMove(doc, 'push-in', { targetId: 'title' });
    const camera = cameraOf(moved);
    expect(camera.props.aim).toBe('target');
    expect(camera.props.targetId).toBe('title');
  });

  it('keeps the aim mode when no target is supplied', () => {
    const doc = createBlankMotionDocument();
    const camera = cameraOf(doc);
    const freed = applyMotionOps(doc, [
      { op: 'scene.node.update', nodeId: 'camera', props: { aim: 'free' } },
    ]);
    const moved = applyMove(freed, 'crane-up');
    expect(cameraOf(moved).props.aim).toBe('free');
    expect(cameraOf(moved).props.fov).toBe(camera.props.fov);
  });

  it('plans a push-in around an off-origin aim target', () => {
    const doc = createBlankMotionDocument();
    const from = cameraOf(doc).transform.position;
    const pivot: [number, number, number] = [0, 1, 0];
    const moved = applyMotionOps(
      doc,
      expandCameraMove(
        'push-in',
        { cameraId: 'camera', from: cameraOf(doc).transform, pivot, start: 0, duration: 2 },
        ids(),
      ),
    );

    const camera = evaluate(moved, 1.999).nodes.find((node) => node.id === 'camera')!;
    const [x, y, z] = camera.transform.position;
    // Still on the camera→subject ray, and ~30% closer to the subject. A move
    // that pivoted on the origin instead would slide sideways off that ray.
    expect((x - pivot[0]) / (from[0] - pivot[0])).toBeCloseTo(0.7, 2);
    expect((y - pivot[1]) / (from[1] - pivot[1])).toBeCloseTo(0.7, 2);
    expect((z - pivot[2]) / (from[2] - pivot[2])).toBeCloseTo(0.7, 2);
  });

  it('orbits an off-origin subject at a constant radius around it', () => {
    const doc = createBlankMotionDocument();
    const from = cameraOf(doc).transform.position;
    const pivot: [number, number, number] = [1.5, 0.5, -0.5];
    const moved = applyMotionOps(
      doc,
      expandCameraMove(
        'orbit-right',
        { cameraId: 'camera', from: cameraOf(doc).transform, pivot, start: 0, duration: 2 },
        ids(),
      ),
    );

    const camera = evaluate(moved, 1.999).nodes.find((node) => node.id === 'camera')!;
    const [x, y, z] = camera.transform.position;
    expect(Math.hypot(x - pivot[0], z - pivot[2])).toBeCloseTo(
      Math.hypot(from[0] - pivot[0], from[2] - pivot[2]),
      5,
    );
    expect(y).toBeCloseTo(from[1], 5);
    const delta =
      Math.atan2(x - pivot[0], z - pivot[2]) - Math.atan2(from[0] - pivot[0], from[2] - pivot[2]);
    expect(delta).toBeCloseTo(Math.PI / 6, 2);
  });

  it('resolves a nested aim target to its world position for the pivot', () => {
    const parent = {
      ...createMotionNode('text.title', 'parent'),
      transform: { position: [1, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] },
    } satisfies MotionNode;
    const child = {
      ...createMotionNode('text.body', 'child'),
      parentId: 'parent',
      transform: { position: [0, 0, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    } satisfies MotionNode;

    // The parent's quarter turn about Y maps the child's +Z offset onto +X.
    const world = motionWorldPosition([parent, child], 'child')!;
    expect(world[0]).toBeCloseTo(3, 6);
    expect(world[1]).toBeCloseTo(0, 6);
    expect(world[2]).toBeCloseTo(0, 6);
    expect(motionWorldPosition([parent], 'child')).toBeNull();
  });
});
