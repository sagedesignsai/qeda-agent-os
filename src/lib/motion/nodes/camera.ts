/**
 * lib/motion/nodes/camera.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Camera primitives. The lens is described by its own props rather than by the
 * node transform, so the viewport and the export renderer can share one frame
 * binding (`motion-frame-binding.ts`) and stay frame-exact.
 *
 * `aim` is the cinematography switch:
 *   - `origin` keeps the original behaviour (look at the world origin, then
 *     apply the keyed rotation as an offset) so existing documents render
 *     exactly as they did;
 *   - `target` aims the camera at another node, which is what makes
 *     "look at the product" shots possible;
 *   - `free` uses the keyed rotation as an absolute orientation.
 */

import { z } from 'zod';

import { motionVector3Schema, type MotionNodeTypeDefinition, type MotionPropertyHint } from './definition';

const hints: Record<string, MotionPropertyHint> = {
  fov: { label: 'Field of view', control: 'slider', min: 1, max: 179, step: 1, group: 'Lens' },
  near: { label: 'Near clip', control: 'number', min: 0.001, step: 0.01, group: 'Lens' },
  far: { label: 'Far clip', control: 'number', min: 0.01, step: 1, group: 'Lens' },
  zoom: { label: 'Zoom', control: 'slider', min: 0.1, max: 4, step: 0.01, group: 'Lens' },

  aim: {
    label: 'Aim',
    control: 'segmented',
    group: 'Aim',
    options: [
      { value: 'target', label: 'Target' },
      { value: 'origin', label: 'Origin' },
      { value: 'free', label: 'Free' },
    ],
  },
  targetId: { label: 'Look at', control: 'node', group: 'Aim', optional: true },
  targetOffset: { label: 'Aim offset', control: 'vector3', step: 0.01, group: 'Aim' },
  roll: { label: 'Roll', control: 'slider', min: -180, max: 180, step: 1, group: 'Aim' },

  dofEnabled: { label: 'Depth of field', control: 'toggle', group: 'Focus' },
  focusDistance: {
    label: 'Focus distance',
    control: 'number',
    min: 0,
    step: 0.01,
    group: 'Focus',
    description: 'World units. 0 focuses on the aim target automatically.',
  },
  aperture: { label: 'Aperture', control: 'slider', min: 1, max: 16, step: 0.1, group: 'Focus' },
  focusRange: { label: 'Focus range', control: 'slider', min: 0.05, max: 20, step: 0.05, group: 'Focus' },

  shake: { label: 'Handheld', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Handheld' },
  shakeSpeed: { label: 'Shake speed', control: 'slider', min: 0.1, max: 10, step: 0.1, group: 'Handheld' },
};

export const cameraPerspective: MotionNodeTypeDefinition = {
  id: 'camera.perspective',
  label: 'Perspective camera',
  category: 'camera',
  description: 'A perspective camera that frames the scene, and can aim at any object.',
  propsSchema: z.object({
    fov: z.number().min(1).max(179),
    near: z.number().positive(),
    far: z.number().positive(),
    zoom: z.number().positive().default(1),
    aim: z.enum(['origin', 'target', 'free']).default('origin'),
    targetId: z.string().nullable().default(null),
    targetOffset: motionVector3Schema.default([0, 0, 0]),
    roll: z.number().min(-180).max(180).default(0),
    dofEnabled: z.boolean().default(false),
    focusDistance: z.number().min(0).default(0),
    aperture: z.number().min(1).max(16).default(2.8),
    focusRange: z.number().min(0.05).max(20).default(2),
    shake: z.number().min(0).max(1).default(0),
    shakeSpeed: z.number().min(0.1).max(10).default(1),
  }),
  defaultProps: {
    fov: 34,
    near: 0.1,
    far: 60,
    zoom: 1,
    aim: 'origin',
    targetId: null,
    targetOffset: [0, 0, 0],
    roll: 0,
    dofEnabled: false,
    focusDistance: 0,
    aperture: 2.8,
    focusRange: 2,
    shake: 0,
    shakeSpeed: 1,
  },
  defaultTransform: { position: [3.7, 2.7, 5.1] },
  animatableProperties: {
    fov: { description: 'Vertical field of view in degrees.' },
    zoom: { description: 'Camera zoom multiplier applied on top of the lens.' },
    roll: { description: 'Camera roll in degrees, applied after aim.' },
    focusDistance: { description: 'Focus distance in world units; 0 follows the aim target.' },
    shake: { description: 'Handheld shake amount, 0–1.' },
  },
  defaultName: 'Camera',
  propertyHints: hints,
};

/** Cameras a scene can render. Kept here so the binding and UI share one list. */
export const MOTION_CAMERA_NODE_TYPES = ['camera.perspective'] as const;

export function isMotionCameraType(type: string): boolean {
  return (MOTION_CAMERA_NODE_TYPES as readonly string[]).includes(type);
}
