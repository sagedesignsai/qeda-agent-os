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
    id: 'nightshift-car-film',
    name: 'Nightshift car film',
    category: 'Product',
    description: 'A three-shot automotive film built around the bundled Ferrari model, with a moving camera and film look.',
    width: 1920,
    height: 1080,
    fps: 24,
    tags: ['cinematic', 'automotive', 'car', 'camera', 'film', 'model'],
    scenes: [
      {
        name: 'Reveal',
        duration: 4.5,
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.7 }),
          node('light.directional', 'key', { intensity: 2.4 }, { position: [4, 6, 3] }),
          node('light.point', 'rim', { intensity: 2.2, color: '#8fb6ff' }, { position: [-3.5, 2.4, -2.5] }),
          node('stage.cyclorama', 'cyclorama', { color: '#121822', roughness: 0.7 }, { position: [0, -0.85, 0] }),
          node('model.gltf', 'product', { assetId: 'local:threejs/ferrari', fitHeight: 1.35, restBottom: -0.85 }, { position: [0, 0, 0] }),
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
          node('stage.cyclorama', 'cyclorama', { color: '#141921', roughness: 0.62 }, { position: [0, -0.85, 0] }),
          node('model.gltf', 'product', { assetId: 'local:threejs/ferrari', fitHeight: 1.35, restBottom: -0.85 }, { position: [0, 0, 0] }),
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
          node('text.title', 'title', { text: 'BUILT TO MOVE', fontSize: 0.3 }, { position: [0, 0.25, 0] }),
          node('text.body', 'sub', { text: 'Find your next road.', fontSize: 0.13, color: '#9fb0c9' }, { position: [0, -0.25, 0] }),
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
  {
    id: 'chronograph-film',
    name: 'Chronograph film',
    category: 'Product',
    description: 'A watchmaker’s three-shot film with a staged hero model, macro camera move, and polished end card.',
    width: 1920,
    height: 1080,
    fps: 24,
    tags: ['cinematic', 'watch', 'product', 'model', 'macro'],
    scenes: [
      {
        name: 'The reveal',
        duration: 4.2,
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.45 }),
          node('light.directional', 'key', { intensity: 3.2, color: '#d4e3ff' }, { position: [3.5, 4, 3] }),
          node('light.point', 'rim', { intensity: 2.4, color: '#e9a85b' }, { position: [-3, 1.8, -2] }),
          node('stage.pedestal', 'pedestal', { color: '#101722', accentColor: '#c69b5d', metalness: 0.55 }, { position: [0, -0.85, 0] }),
          node('model.gltf', 'watch', { assetId: 'local:khronos/ChronographWatch', fitHeight: 1.5, restBottom: -0.5 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 28, aim: 'target', targetId: 'watch', targetOffset: [0, 0.1, 0], dofEnabled: true, aperture: 2.2, focusRange: 0.9 }, { position: [1.2, 1.1, 6.4] }),
          ...cinematicLook('reveal_look'),
        ],
        clips: [
          showcaseClip('s1_watch_turn', 'Watch turn', 4.2, 'watch', [
            { property: 'rotation.y', keys: [{ time: 0, value: -0.55, easing: SMOOTH }, { time: 4.1, value: 0.25, easing: LINEAR }] },
          ]),
          showcaseClip('s1_camera_push', 'Camera push', 4.2, 'cam', [
            { property: 'position.z', keys: [{ time: 0, value: 7.2, easing: SMOOTH }, { time: 4.1, value: 5.7, easing: LINEAR }] },
            { property: 'position.x', keys: [{ time: 0, value: 1.5, easing: SMOOTH }, { time: 4.1, value: 0.7, easing: LINEAR }] },
          ]),
        ],
      },
      {
        name: 'The detail',
        duration: 3.6,
        transitionIn: { type: 'crossfade', duration: 0.45 },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.35 }),
          node('light.directional', 'key', { intensity: 3.8, color: '#ffe0b2' }, { position: [2.4, 3.2, 2.2] }),
          node('light.point', 'rim', { intensity: 2.8, color: '#6b9ce8' }, { position: [-2.5, 1, -2] }),
          node('model.gltf', 'watch', { assetId: 'local:khronos/ChronographWatch', fitHeight: 1.5, restBottom: -0.5 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 23, aim: 'target', targetId: 'watch', targetOffset: [0, 0.05, 0], dofEnabled: true, aperture: 1.8, focusRange: 0.65 }, { position: [2.1, 0.85, 3.6] }),
          ...cinematicLook('detail_look'),
        ],
        clips: [
          showcaseClip('s2_watch_turn', 'Detail turn', 3.6, 'watch', [
            { property: 'rotation.y', keys: [{ time: 0, value: 0.25, easing: SMOOTH }, { time: 3.5, value: 1.1, easing: LINEAR }] },
          ]),
          showcaseClip('s2_orbit', 'Macro orbit', 3.6, 'cam', [
            { property: 'position.x', keys: [{ time: 0, value: 2.1, easing: SMOOTH }, { time: 3.5, value: 1.05, easing: LINEAR }] },
            { property: 'position.z', keys: [{ time: 0, value: 3.6, easing: SMOOTH }, { time: 3.5, value: 3.0, easing: LINEAR }] },
          ]),
        ],
      },
      {
        name: 'The signature',
        duration: 3.4,
        transitionIn: { type: 'crossfade', duration: 0.5 },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.6 }),
          node('light.directional', 'key', { intensity: 2.2, color: '#fff1d8' }, { position: [2, 4, 4] }),
          node('stage.backdrop', 'backdrop', { topColor: '#182234', bottomColor: '#06090f' }, { position: [0, 0.3, -3.5] }),
          node('text.title', 'title', { text: 'MADE TO LAST', fontSize: 0.3, color: '#f3dfbd' }, { position: [0, 0.18, 0.8] }),
          node('text.body', 'subtitle', { text: 'Precision, in every second.', fontSize: 0.13, color: '#b1bdce' }, { position: [0, -0.25, 0.8] }),
          node('camera.perspective', 'cam', { fov: 32, aim: 'target', targetId: 'title', dofEnabled: true, aperture: 2.8, focusRange: 2.4 }, { position: [0, 0.2, 6.2] }),
          ...cinematicLook('signature_look'),
        ],
        clips: [
          showcaseClip('s3_push', 'Signature push', 3.4, 'cam', [
            { property: 'position.z', keys: [{ time: 0, value: 6.8, easing: SMOOTH }, { time: 3.3, value: 5.8, easing: LINEAR }] },
          ]),
          showcaseClip('s3_title_reveal', 'Title reveal', 3.4, 'title', [
            { property: 'opacity', keys: [{ time: 0.2, value: 0, easing: EASE_OUT }, { time: 1.1, value: 1, easing: LINEAR }] },
            { property: 'position.y', keys: [{ time: 0.2, value: 0.36, easing: EASE_OUT }, { time: 1.1, value: 0.18, easing: LINEAR }] },
          ]),
          showcaseClip('s3_subtitle_reveal', 'Subtitle reveal', 3.4, 'subtitle', [
            { property: 'opacity', keys: [{ time: 0.7, value: 0, easing: EASE_OUT }, { time: 1.5, value: 1, easing: LINEAR }] },
          ]),
        ],
      },
    ],
  },
  {
    id: 'solstice-footwear-film',
    name: 'Solstice footwear film',
    category: 'Product',
    description: 'A vertical fashion film built around the bundled shoe model, with a warm studio orbit and confident end card.',
    width: 1080,
    height: 1920,
    fps: 30,
    tags: ['cinematic', 'vertical', 'fashion', 'product', 'model'],
    scenes: [
      {
        name: 'First light',
        duration: 4.5,
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.7 }),
          node('light.directional', 'key', { intensity: 3.4, color: '#ffe2bf' }, { position: [-2.5, 3.5, 3] }),
          node('light.point', 'rim', { intensity: 2.1, color: '#df956d' }, { position: [2.5, 1.8, -2] }),
          node('stage.cyclorama', 'cyclorama', { color: '#9a755a', roughness: 0.82 }, { position: [0, -0.72, 0] }),
          node('model.gltf', 'shoe', { assetId: 'local:khronos/MaterialsVariantsShoe', fitHeight: 1.2, restBottom: -0.72 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 30, aim: 'target', targetId: 'shoe', targetOffset: [0, 0.2, 0], dofEnabled: true, aperture: 2, focusRange: 1 }, { position: [0.8, 1.1, 8] }),
          ...cinematicLook('first_light_look'),
        ],
        clips: [
          showcaseClip('s1_shoe_turn', 'Shoe turn', 4.5, 'shoe', [
            { property: 'rotation.y', keys: [{ time: 0, value: -0.35, easing: SMOOTH }, { time: 4.4, value: 0.35, easing: LINEAR }] },
          ]),
          showcaseClip('s1_camera_move', 'Slow push', 4.5, 'cam', [
            { property: 'position.z', keys: [{ time: 0, value: 8, easing: SMOOTH }, { time: 4.4, value: 7.2, easing: LINEAR }] },
          ]),
        ],
      },
      {
        name: 'The ritual',
        duration: 4,
        transitionIn: { type: 'crossfade', duration: 0.5 },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.65 }),
          node('light.directional', 'key', { intensity: 3.2, color: '#fff0dc' }, { position: [2.3, 3.5, 2.4] }),
          node('light.point', 'rim', { intensity: 2.3, color: '#9ec4ba' }, { position: [-2.5, 1.4, -1.8] }),
          node('stage.cyclorama', 'cyclorama', { color: '#805f4d', roughness: 0.8 }, { position: [0, -0.72, 0] }),
          node('model.gltf', 'shoe', { assetId: 'local:khronos/MaterialsVariantsShoe', fitHeight: 1.2, restBottom: -0.72 }, { position: [0, 0, 0] }),
          node('text.title', 'title', { text: 'Move with ease', fontSize: 0.22, color: '#fff4e8' }, { position: [0, 1.55, 0.4] }),
          node('camera.perspective', 'cam', { fov: 32, aim: 'target', targetId: 'shoe', dofEnabled: true, aperture: 2.4, focusRange: 1.4 }, { position: [0.6, 0.7, 7.8] }),
          ...cinematicLook('ritual_look'),
        ],
        clips: [
          showcaseClip('s2_orbit', 'Ritual orbit', 4, 'cam', [
            { property: 'position.x', keys: [{ time: 0, value: 1.1, easing: SMOOTH }, { time: 3.9, value: -0.7, easing: LINEAR }] },
            { property: 'position.z', keys: [{ time: 0, value: 7.8, easing: SMOOTH }, { time: 3.9, value: 7.3, easing: LINEAR }] },
          ]),
          showcaseClip('s2_title', 'Title settle', 4, 'title', [
            { property: 'opacity', keys: [{ time: 0.3, value: 0, easing: EASE_OUT }, { time: 1.3, value: 1, easing: LINEAR }] },
            { property: 'position.y', keys: [{ time: 0.3, value: 1.8, easing: EASE_OUT }, { time: 1.3, value: 1.55, easing: LINEAR }] },
          ]),
        ],
      },
      {
        name: 'The promise',
        duration: 3.2,
        transitionIn: { type: 'crossfade', duration: 0.5 },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.6 }),
          node('stage.backdrop', 'backdrop', { topColor: '#4c4039', bottomColor: '#161512' }, { position: [0, 0.4, -3] }),
          node('text.title', 'title', { text: 'Return to balance', fontSize: 0.28, color: '#fff0dc' }, { position: [0, 0.2, 0.8] }),
          node('text.body', 'subtitle', { text: 'Made for your everyday.', fontSize: 0.13, color: '#e0cdb7' }, { position: [0, -0.22, 0.8] }),
          node('camera.perspective', 'cam', { fov: 33, aim: 'target', targetId: 'title' }, { position: [0, 0.2, 6] }),
          ...cinematicLook('promise_look'),
        ],
        clips: [
          showcaseClip('s3_title', 'Promise title', 3.2, 'title', [
            { property: 'opacity', keys: [{ time: 0.15, value: 0, easing: EASE_OUT }, { time: 1.1, value: 1, easing: LINEAR }] },
          ]),
          showcaseClip('s3_subtitle', 'Promise subtitle', 3.2, 'subtitle', [
            { property: 'opacity', keys: [{ time: 0.6, value: 0, easing: EASE_OUT }, { time: 1.4, value: 1, easing: LINEAR }] },
          ]),
          showcaseClip('s3_push', 'Final push', 3.2, 'cam', [
            { property: 'position.z', keys: [{ time: 0, value: 6.6, easing: SMOOTH }, { time: 3.1, value: 5.8, easing: LINEAR }] },
          ]),
        ],
      },
    ],
  },
  {
    id: 'obscura-camera-ident',
    name: 'Obscura camera ident',
    category: 'Brand',
    description: 'A dramatic camera-themed brand ident featuring the bundled steampunk camera model and an atmospheric title reveal.',
    width: 1920,
    height: 1080,
    fps: 24,
    tags: ['cinematic', 'brand', 'camera', 'title', 'particles', 'model'],
    scenes: [
      {
        name: 'Atmosphere',
        duration: 4,
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.3 }),
          node('light.point', 'glow', { intensity: 2.8, color: '#d98a58' }, { position: [-2.2, 1.5, -1.5] }),
          node('stage.particles', 'dust', { count: 420, color: '#f2bd85', radius: 5, size: 0.026, opacity: 0.36, seed: 11 }, { position: [0, 0, -0.4] }),
          node('model.gltf', 'emblem', { assetId: 'local:threejs/steampunk_camera', fitHeight: 1.35, restBottom: -0.7 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34, aim: 'target', targetId: 'emblem', dofEnabled: true, aperture: 2.4, focusRange: 1.1 }, { position: [0.7, 0.3, 7.2] }),
          ...cinematicLook('atmosphere_look'),
        ],
        clips: [
          showcaseClip('s1_emblem', 'Emblem turn', 4, 'emblem', [
            { property: 'rotation.y', keys: [{ time: 0, value: -0.6, easing: SMOOTH }, { time: 3.9, value: 0.7, easing: LINEAR }] },
            { property: 'rotation.x', keys: [{ time: 0, value: 0.2, easing: SMOOTH }, { time: 3.9, value: -0.15, easing: LINEAR }] },
          ]),
          showcaseClip('s1_camera', 'Atmospheric drift', 4, 'cam', [
            { property: 'position.x', keys: [{ time: 0, value: 1.1, easing: SMOOTH }, { time: 3.9, value: -0.5, easing: LINEAR }] },
            { property: 'position.z', keys: [{ time: 0, value: 7.2, easing: SMOOTH }, { time: 3.9, value: 6.3, easing: LINEAR }] },
          ]),
        ],
      },
      {
        name: 'The name',
        duration: 3.5,
        transitionIn: { type: 'dip', duration: 0.4, color: '#100c0a' },
        cameraId: 'cam',
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.45 }),
          node('stage.backdrop', 'backdrop', { topColor: '#211811', bottomColor: '#090807' }, { position: [0, 0.2, -3] }),
          node('text.title', 'title', { text: 'OBSCURA', fontSize: 0.52, color: '#f0c99d' }, { position: [0, 0.15, 0.7] }),
          node('text.body', 'subtitle', { text: 'A new point of view', fontSize: 0.14, color: '#c4a989' }, { position: [0, -0.34, 0.7] }),
          node('camera.perspective', 'cam', { fov: 30, aim: 'target', targetId: 'title', dofEnabled: true, aperture: 2.6, focusRange: 2 }, { position: [0, 0.2, 6.8] }),
          ...cinematicLook('name_look'),
        ],
        clips: [
          showcaseClip('s2_title', 'Title reveal', 3.5, 'title', [
            { property: 'opacity', keys: [{ time: 0.2, value: 0, easing: EASE_OUT }, { time: 1.3, value: 1, easing: LINEAR }] },
            { property: 'position.y', keys: [{ time: 0.2, value: 0.34, easing: EASE_OUT }, { time: 1.3, value: 0.15, easing: LINEAR }] },
          ]),
          showcaseClip('s2_subtitle', 'Subtitle reveal', 3.5, 'subtitle', [
            { property: 'opacity', keys: [{ time: 0.8, value: 0, easing: EASE_OUT }, { time: 1.7, value: 1, easing: LINEAR }] },
          ]),
          showcaseClip('s2_push', 'Title push', 3.5, 'cam', [
            { property: 'position.z', keys: [{ time: 0, value: 7.2, easing: SMOOTH }, { time: 3.4, value: 6.2, easing: LINEAR }] },
          ]),
        ],
      },
    ],
  },
];
