/**
 * __tests__/motion-motion-track.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Blender-style sampled motion must land as ordinary, sorted keyframes that the
 * existing sampler already understands.
 */

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { planMotionTrackImport } from '@/lib/motion/motion-track';
import { applyMotionOps } from '@/lib/motion/ops';

const NOW = '2026-01-01T00:00:00.000Z';

function ids() {
  let next = 0;
  return (kind: string) => `${kind}_${++next}`;
}

describe('planMotionTrackImport', () => {
  it('bakes position samples into a track, clip, channels and linear keys', () => {
    const doc = createStarterMotionDocument(NOW);
    const ops = planMotionTrackImport(
      doc,
      {
        fps: 30,
        coordinateSystem: 'blender',
        tracks: [
          {
            targetId: 'product',
            channels: {
              position: [
                [0, [0, 0, 0]],
                [2, [1, 2, 3]],
              ],
            },
          },
        ],
      },
      ids(),
    );
    const next = applyMotionOps(doc, ops);
    const track = next.timeline.tracks.find((item) => item.name === 'Product · baked motion');
    expect(track).toBeDefined();
    const clip = next.timeline.clips.find((item) => item.id === track?.placements[0].clipId);
    expect(clip?.duration).toBe(6);
    const x = clip?.channels.find((channel) => channel.property === 'position.x');
    const y = clip?.channels.find((channel) => channel.property === 'position.y');
    const z = clip?.channels.find((channel) => channel.property === 'position.z');
    // Blender (x, y, z) -> Three (x, z, -y).
    expect(x?.keyframes.map((key) => key.value)).toEqual([0, 1]);
    expect(y?.keyframes.map((key) => key.value)).toEqual([0, 3]);
    expect(z?.keyframes.map((key) => key.value)).toEqual([0, -2]);
    expect(x?.keyframes.every((key) => key.easing.type === 'linear')).toBe(true);
  });

  it('converts rotation degrees and clamps keys into the scene timeline', () => {
    const doc = createStarterMotionDocument(NOW);
    const ops = planMotionTrackImport(
      doc,
      {
        fps: 30,
        tracks: [
          {
            targetId: 'camera',
            channels: {
              rotation: [
                [0, [0, 90, 0]],
                [9, [0, 180, 0]],
              ],
            },
          },
        ],
      },
      ids(),
    );
    const next = applyMotionOps(doc, ops);
    const channel = next.timeline.clips
      .flatMap((clip) => clip.channels)
      .find((item) => item.targetId === 'camera' && item.property === 'rotation.y');
    expect(channel?.keyframes[0].value).toBeCloseTo(Math.PI / 2, 9);
    expect(next.scenes[0].timeline.duration).toBe(9);
    expect(channel?.keyframes.at(-1)?.time).toBeLessThanOrEqual(
      next.scenes[0].timeline.duration,
    );
  });

  it('expands scale and camera FOV samples into the channels the sampler expects', () => {
    const doc = createStarterMotionDocument(NOW);
    const ops = planMotionTrackImport(
      doc,
      {
        fps: 30,
        tracks: [
          {
            targetId: 'product',
            channels: { scale: [[0, 1], [2, 1.5]] },
          },
          {
            targetId: 'camera',
            channels: { fov: [[0, 34], [2, 45]] },
          },
        ],
      },
      ids(),
    );
    const next = applyMotionOps(doc, ops);
    const productChannels = next.timeline.clips
      .flatMap((clip) => clip.channels)
      .filter((item) => item.targetId === 'product' && item.property.startsWith('scale.'));
    expect(productChannels).toHaveLength(3);
    expect(productChannels.every((channel) => channel.keyframes.map((key) => key.value).join(',') === '1,1.5')).toBe(true);
    const fov = next.timeline.clips
      .flatMap((clip) => clip.channels)
      .find((item) => item.targetId === 'camera' && item.property === 'fov');
    expect(fov?.keyframes.map((key) => key.value)).toEqual([34, 45]);
  });

  it('rejects unknown targets and unsupported channels', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(() =>
      planMotionTrackImport(
        doc,
        { fps: 30, tracks: [{ targetId: 'missing', channels: { position: [[0, [0, 0, 0]]] } }] },
        ids(),
      ),
    ).toThrow(/not in the active scene/);
    expect(() =>
      planMotionTrackImport(
        doc,
        { fps: 30, tracks: [{ targetId: 'product', channels: { position: [[0, 1]] } }] },
        ids(),
      ),
    ).toThrow(/three-number array/);
  });
});