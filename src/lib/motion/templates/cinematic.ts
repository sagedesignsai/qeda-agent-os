/**
 * lib/motion/templates/cinematic.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The "cinematic" corner of the catalog: a three-shot product teaser that
 * demonstrates the camera rig and the look stack together.
 *
 * It is deliberately short and readable. Each shot is one camera idea (reveal,
 * detail, end card), each ships a complete `fx.*` stack, and the camera aims at
 * the product instead of the world origin — so the template doubles as a
 * reference document for how the new rig is meant to be used.
 */

import { EASING_PRESETS } from '../easing';
import { node, type TemplateSpec } from './spec';
import { showcaseClip } from './shared';

const SMOOTH = EASING_PRESETS.smooth.value;
const EASE_OUT = EASING_PRESETS.easeOut.value;
const LINEAR = EASING_PRESETS.linear.value;

const cinematicLookNodes = [
  { type: 'fx.grade', id: 'grade', props: { exposure: 0.06, contrast: 0.2, saturation: 0.1, temperature: 0.14, tint: 0.02 } },
  { type: 'fx.lens-distortion', id: 'lens', props: { radial1: 0.01, radial2: 0 } },
  { type: 'fx.bloom', id: 'bloom', props: { intensity: 0.65, threshold: 0.82, smoothing: 0.35 } },
  { type: 'fx.vignette', id: 'vignette', props: { offset: 0.34, darkness: 0.6 } },
  { type: 'fx.grain', id: 'grain', props: { amount: 0.2 } },
  { type: 'fx.letterbox', id: 'letterbox', props: { aspect: 2.39, opacity: 1 } },
];

function cinematicLook(id = 'look') {
  const stack = node('fx.stack', `${id}_stack`);
  const effects = cinematicLookNodes.map(({ type, id: effectId, props }) => {
    const effect = node(type, `${id}_${effectId}`, props);
    effect.parentId = stack.id;
    return effect;
  });
  return [stack, ...effects];
}

export const cinematicTemplates: TemplateSpec[] = [
  {
    id: 'cine-teaser',
    name: 'Cine teaser',
    category: 'Product',
    description: 'Three cinematic product shots: reveal, detail, end card — with aims, depth of field and a film look.',
    width: 1920,
    height: 1080,
    fps: 24,
    tags: ['cinematic', 'teaser', 'product', 'camera', 'film'],
    scenes: [
      {
        name: 'Reveal',
        duration: 4.5,
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.7 }),
          node('light.directional', 'key', { intensity: 2.4 }, { position: [4, 6, 3] }),
          node('light.point', 'rim', { intensity: 2.2, color: '#8fb6ff' }, { position: [-3.5, 2.4, -2.5] }),
          node('stage.pedestal', 'pedestal', {}, { position: [0, -0.9, 0] }),
          node('product.bottle', 'product', {}, { position: [0, 0.15, 0] }),
          node('camera.perspective', 'cam', {
            fov: 30,
            aim: 'target',
            targetId: 'product',
            targetOffset: [0, 0.35, 0],
            dofEnabled: true,
            aperture: 1.8,
            focusRange: 1.1,
            shake: 0.12,
            shakeSpeed: 0.9,
          }, { position: [1.1, 1.4, 6.2] }),
          ...cinematicLook(),
        ],
        clips: [
          showcaseClip('s1_dolly', 'Dolly in', 4.5, 'cam', [
            {
              property: 'position.z',
              keys: [
                { time: 0, value: 6.2, easing: SMOOTH },
                { time: 4.4, value: 4.9, easing: LINEAR },
              ],
            },
            {
              property: 'position.x',
              keys: [
                { time: 0, value: 1.1, easing: SMOOTH },
                { time: 4.4, value: 0.55, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
      {
        name: 'Detail',
        duration: 3.5,
        transitionIn: { type: 'crossfade', duration: 0.45 },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.5 }),
          node('light.directional', 'key', { intensity: 2.8 }, { position: [3, 5, 2] }),
          node('light.point', 'rim', { intensity: 3, color: '#ffb98a' }, { position: [-2.6, 1.8, -2] }),
          node('product.bottle', 'product', {}, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', {
            fov: 26,
            aim: 'target',
            targetId: 'product',
            targetOffset: [0, 0.5, 0],
            roll: -3,
            dofEnabled: true,
            aperture: 2.2,
            focusRange: 0.7,
            shake: 0.22,
            shakeSpeed: 1.4,
          }, { position: [2.1, 0.9, 3.4] }),
          ...cinematicLook(),
        ],
        clips: [
          showcaseClip('s2_orbit', 'Orbit', 3.5, 'cam', [
            {
              property: 'position.x',
              keys: [
                { time: 0, value: 2.1, easing: SMOOTH },
                { time: 3.4, value: 0.9, easing: LINEAR },
              ],
            },
            {
              property: 'position.z',
              keys: [
                { time: 0, value: 3.4, easing: SMOOTH },
                { time: 3.4, value: 2.8, easing: LINEAR },
              ],
            },
            {
              property: 'roll',
              keys: [
                { time: 0, value: -3, easing: EASE_OUT },
                { time: 3.4, value: 2, easing: LINEAR },
              ],
            },
          ]),
          showcaseClip('s2_spin', 'Product spin', 3.5, 'product', [
            {
              property: 'rotation.y',
              keys: [
                { time: 0, value: 0, easing: LINEAR },
                { time: 3.4, value: Math.PI * 0.9, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
      {
        name: 'End card',
        duration: 3,
        transitionIn: { type: 'crossfade', duration: 0.45 },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.6 }),
          node('light.directional', 'key', { intensity: 2 }, { position: [2, 4, 4] }),
          node('text.title', 'title', { text: 'Engineered to be seen', fontSize: 0.3 }, { position: [0, 0.25, 0] }),
          node('text.body', 'sub', { text: 'Available spring 2027', fontSize: 0.13, color: '#9fb0c9' }, { position: [0, -0.25, 0] }),
          node('camera.perspective', 'cam', {
            fov: 32,
            aim: 'target',
            targetId: 'title',
            dofEnabled: true,
            aperture: 2.8,
            focusRange: 2.4,
          }, { position: [0, 0.2, 6.4] }),
          ...cinematicLook('end_look'),
        ],
        clips: [
          showcaseClip('s3_push', 'Push in', 3, 'cam', [
            {
              property: 'position.z',
              keys: [
                { time: 0, value: 6.4, easing: SMOOTH },
                { time: 2.9, value: 5.6, easing: LINEAR },
              ],
            },
          ]),
          showcaseClip('s3_title', 'Title in', 3, 'title', [
            {
              property: 'opacity',
              keys: [
                { time: 0.3, value: 0, easing: EASE_OUT },
                { time: 1.2, value: 1, easing: LINEAR },
              ],
            },
          ]),
          showcaseClip('s3_sub', 'Subtitle in', 3, 'sub', [
            {
              property: 'opacity',
              keys: [
                { time: 0.8, value: 0, easing: EASE_OUT },
                { time: 1.7, value: 1, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
    ],
  },
];
