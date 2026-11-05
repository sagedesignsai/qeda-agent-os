/**
 * lib/motion/model-fit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure math for folding a foreign GLB's authored units into a Motion stage.
 *
 * Bundled models arrive in wildly different units (a sneaker 0.15 units tall,
 * a watch 5.8, a threejs bird 89), while Motion scenes expect ~1-unit products
 * on a ~7-unit-deep camera. Normalizing inside the renderer would silently
 * rewrite every existing user project, so instead the template declares a
 * target footprint (`fitHeight` + `restBottom`, stored as scratch props on the
 * node) and main-process staging folds the bounds into the node's real
 * transform and its keyframes. The renderer stays dumb and the inspector shows
 * only the genuinely baked numbers.
 *
 * Keyframe retargeting keeps the shared.ts invariant: the final keyframe of a
 * transform channel equals the node's animated rest pose, because the same
 * delta that moves the static position also moves every `position.y` key, and
 * scale keys scale by the same ratio as the node's static scale.
 */

import type { MotionClip } from './types';

export type ModelBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type ModelFit = {
  /** Uniform world scale to write into the node's static transform. */
  scale: number;
  /** World-space position.y to write into the node's static transform. */
  positionY: number;
};

/**
 * Solve the transform that puts the model's bounding box (`bounds`, in model
 * space) at exactly `fitHeight` tall with its floor at `restBottom`.
 */
export function computeModelFit(bounds: ModelBounds, fitHeight: number, restBottom: number): ModelFit {
  if (![bounds.min[1], bounds.max[1]].every(Number.isFinite)) {
    throw new Error('Model bounds must be finite numbers.');
  }
  if (!(fitHeight > 0)) throw new Error('Model fit height must be positive.');
  const height = bounds.max[1] - bounds.min[1];
  if (!(height > 0)) throw new Error('Model bounds have zero height.');
  const scale = fitHeight / height;
  return { scale, positionY: restBottom - scale * bounds.min[1] };
}

const SCALE_PROPERTIES = new Set(['scale.x', 'scale.y', 'scale.z']);

/**
 * Rewrite every `position.y` / `scale.*` keyframe of channels targeting
 * `targetId` so the animated rest pose matches a re-baked static transform.
 *
 * `positionYShift = bakedRestY − authoredRestY` — the author wrote keys ending
 * at the node's authored static `y`; staging moved that static to `bakedRestY`,
 * so every key shifts by the same delta. Scale keys multiply by `scaleRatio`
 * (`bakedScale / authoredScale`), keeping "final key = static scale" true.
 */
export function retargetModelChannels(
  clips: readonly MotionClip[],
  targetId: string,
  positionYShift: number,
  scaleRatio: number,
): MotionClip[] {
  const touchesFit = clips.some((clip) =>
    clip.channels.some(
      (channel) =>
        channel.targetId === targetId &&
        (channel.property === 'position.y' || SCALE_PROPERTIES.has(channel.property)),
    ),
  );
  if (!touchesFit) return clips as MotionClip[];
  return clips.map((clip) => ({
    ...clip,
    channels: clip.channels.map((channel) => {
      if (channel.targetId !== targetId) return channel;
      if (channel.property === 'position.y') {
        return {
          ...channel,
          keyframes: channel.keyframes.map((key) => ({
            ...key,
            value: key.value + positionYShift,
          })),
        };
      }
      if (SCALE_PROPERTIES.has(channel.property)) {
        return {
          ...channel,
          keyframes: channel.keyframes.map((key) => ({
            ...key,
            value: key.value * scaleRatio,
          })),
        };
      }
      return channel;
    }),
  }));
}
