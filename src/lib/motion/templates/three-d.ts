/**
 * lib/motion/templates/three-d.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The 3D-motion side of the catalog. These are reference documents for the
 * procedural studio world, rounded/beveled geometry, GPU particles and the
 * printed-card pipeline; each one is authored entirely from registered nodes so
 * every value stays editable in the inspector.
 */

import { EASING_PRESETS } from '../easing';
import { node, type TemplateSpec } from './template-spec';
import { showcaseClip } from './shared';

const LINEAR = EASING_PRESETS.linear.value;
const EASE_OUT = EASING_PRESETS.easeOut.value;
const SMOOTH = EASING_PRESETS.smooth.value;

export const threeDTemplates: TemplateSpec[] = [
  {
    id: 'product-turntable',
    name: 'Product turntable',
    category: 'Product',
    description: 'A seamless product loop on a studio plinth with procedural softbox reflections and a baked contact shadow.',
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ['3d', 'product', 'turntable', 'studio', 'loop', 'metallic'],
    scenes: [
      {
        name: 'Turntable',
        duration: 6,
        cameraId: 'cam',
        background: { type: 'studio', variant: 'softbox', color: '#e8e4dc', intensity: 1.15 },
        nodes: [
          node('light.directional', 'key', {
            intensity: 2.4,
            color: '#ffffff',
            castShadow: true,
            shadowMapSize: 2048,
            shadowRadius: 6,
          }, { position: [-4, 5.5, 4] }),
          node('light.point', 'rim', { intensity: 4.2, color: '#cfe0ff', distance: 14 }, { position: [4, 2.2, -3] }),
          node('stage.pedestal', 'plinth', {
            radius: 1.15,
            height: 0.32,
            color: '#f4f1ec',
            accentColor: '#d7d1c6',
            roughness: 0.52,
            metalness: 0.02,
          }),
          node('stage.contact-shadow', 'shadow', {
            width: 2.8,
            depth: 2.8,
            opacity: 0.34,
            softness: 0.68,
          }, { position: [0, 0.004, 0] }),
          node('product.can', 'product', {
            radius: 0.42,
            height: 1.45,
            bodyColor: '#d8dde4',
            accentColor: '#e3b341',
            labelColor: '#f7f2e6',
            metalness: 0.86,
            roughness: 0.24,
            logoScale: 0.72,
          }, { position: [0, 0.725, 0] }),
          node('camera.perspective', 'cam', {
            fov: 30,
            aim: 'target',
            targetId: 'product',
            targetOffset: [0, 0, 0],
            dofEnabled: true,
            aperture: 4,
            focusRange: 3.2,
          }, { position: [0, 1.55, 6.2] }),
        ],
        clips: [
          showcaseClip('spin', 'Turntable', 6, 'product', [
            {
              property: 'rotation.y',
              keys: [
                { time: 0, value: 0, easing: LINEAR },
                { time: 6, value: Math.PI * 2, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
    ],
  },
  {
    id: 'exploded-stack',
    name: 'Exploded stack',
    category: 'Product',
    description: 'A layered system separates into an isometric exploded view, holds for inspection and closes again.',
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ['3d', 'exploded', 'product', 'isometric', 'layers', 'technical'],
    scenes: [
      {
        name: 'Exploded view',
        duration: 5.5,
        cameraId: 'cam',
        background: { type: 'studio', variant: 'softbox', color: '#f4f4f5', intensity: 0.9 },
        nodes: [
          node('light.ambient', 'ambient', { intensity: 1.1, color: '#ffffff' }),
          node('light.directional', 'key', { intensity: 2, color: '#ffffff' }, { position: [-4, 8, 6] }),
          node('stage.contact-shadow', 'shadow', {
            width: 8,
            depth: 8,
            opacity: 0.2,
            softness: 0.8,
          }, { position: [0, -1.48, 0] }),
          node('camera.perspective', 'cam', {
            fov: 24,
            aim: 'origin',
            dofEnabled: true,
            aperture: 5.6,
            focusRange: 7,
          }, { position: [8.5, 8, 8.5] }),
          ...stackPlate(0, 'Interface', '#0a84ff'),
          ...stackPlate(1, 'API gateway', '#40c8a8'),
          ...stackPlate(2, 'Services', '#f0a04b'),
          ...stackPlate(3, 'Data', '#9b7bf0'),
        ],
        clips: [
          ...stackPlateClip(0),
          ...stackPlateClip(1),
          ...stackPlateClip(2),
          ...stackPlateClip(3),
          ...stackLabelClip(0),
          ...stackLabelClip(1),
          ...stackLabelClip(2),
          ...stackLabelClip(3),
        ],
      },
    ],
  },
  {
    id: 'extruded-logo',
    name: 'Extruded logo',
    category: 'Brand',
    description: 'Chrome 3D lettering catches a dark studio softbox rig, swings to camera and holds for the tagline.',
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ['3d', 'logo', 'extruded', 'chrome', 'softbox', 'brand'],
    scenes: [
      {
        name: 'Logo reveal',
        duration: 5,
        cameraId: 'cam',
        background: { type: 'studio', variant: 'dark', color: '#0c0d12', intensity: 1.4 },
        nodes: [
          node('light.directional', 'rim', { intensity: 3.2, color: '#fff4e6' }, { position: [0, 3, -6] }),
          node('light.directional', 'key', { intensity: 1.6, color: '#ffffff' }, { position: [-5, 4, 6] }),
          node('text.extruded', 'word', {
            text: 'NOVA',
            fontSize: 1.25,
            depth: 0.26,
            bevelSize: 0.03,
            bevelThickness: 0.05,
            tracking: 0.06,
            finish: 'chrome',
          }, { position: [0, 0.18, 0] }),
          node('text.body', 'tagline', {
            text: 'A new standard',
            fontSize: 0.2,
            color: '#c9d1e2',
            maxWidth: 8,
            letterSpacing: 0.06,
          }, { position: [0, -1.2, 0] }),
          node('camera.perspective', 'cam', { fov: 26, aim: 'origin' }, { position: [0, 0.2, 6.4] }),
        ],
        clips: [
          showcaseClip('word_swing', 'Logo swing', 5, 'word', [
            {
              property: 'rotation.y',
              keys: [
                { time: 0, value: -0.42, easing: SMOOTH },
                { time: 2.6, value: 0, easing: LINEAR },
              ],
            },
            {
              property: 'rotation.x',
              keys: [
                { time: 0, value: 0.06, easing: SMOOTH },
                { time: 2.6, value: 0, easing: LINEAR },
              ],
            },
          ]),
          showcaseClip('tagline_in', 'Tagline in', 5, 'tagline', [
            {
              property: 'opacity',
              keys: [
                { time: 1.3, value: 0, easing: EASE_OUT },
                { time: 2.1, value: 1, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
    ],
  },
  {
    id: 'galaxy-orbit',
    name: 'Galaxy orbit',
    category: 'Brand',
    description: 'A GPU particle galaxy with differential rotation and a slow camera drift, built for premium end cards.',
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ['3d', 'particles', 'galaxy', 'shader', 'space', 'background'],
    scenes: [
      {
        name: 'Galaxy',
        duration: 7,
        cameraId: 'cam',
        background: { type: 'color', color: '#04060c' },
        nodes: [
          node('procedural.galaxy', 'galaxy', {
            count: 18000,
            radius: 4.6,
            branches: 3,
            spin: 0.8,
            rate: 0.12,
            size: 2.1,
            coreColor: '#ffd9a0',
            rimColor: '#6aa8ff',
            glow: 1.3,
            seed: 11,
          }, { rotation: [0.42, 0, 0.18] }),
          node('fx.bloom', 'bloom', { intensity: 0.7, threshold: 0.55, smoothing: 0.4 }),
          node('camera.perspective', 'cam', { fov: 38, aim: 'origin' }, { position: [0, 1.7, 8.4] }),
        ],
        clips: [
          showcaseClip('galaxy_turn', 'Galaxy turn', 7, 'galaxy', [
            {
              property: 'rotation.y',
              keys: [
                { time: 0, value: 0, easing: LINEAR },
                { time: 7, value: 0.7, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
    ],
  },
  {
    id: 'three-d-carousel',
    name: '3D card carousel',
    category: 'Product',
    description: 'Printed 3D feature cards orbit as one rigid group, with beveled edges and studio reflections.',
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ['3d', 'carousel', 'cards', 'ui', 'product', 'orbit'],
    scenes: [
      {
        name: 'Carousel',
        duration: 8,
        cameraId: 'cam',
        background: { type: 'studio', variant: 'softbox', color: '#0b0d13', intensity: 1 },
        nodes: [
          node('light.ambient', 'ambient', { intensity: 0.5, color: '#ffffff' }),
          node('light.directional', 'key', { intensity: 2.4, color: '#ffffff' }, { position: [3, 6, 5] }),
          node('light.point', 'rim', { intensity: 3, color: '#7aa2ff', distance: 16 }, { position: [-4, 1.5, -3] }),
          node('stage.ground', 'floor', { size: 24, color: '#10141c', roughness: 0.55, metalness: 0.2 }, { position: [0, -1.55, 0] }),
          node('stage.contact-shadow', 'shadow', {
            width: 7,
            depth: 7,
            opacity: 0.3,
            softness: 0.7,
          }, { position: [0, -1.54, 0] }),
          node('scene.group', 'carousel'),
          ...carouselCards(),
          node('camera.perspective', 'cam', { fov: 32, aim: 'origin', dofEnabled: true, aperture: 4, focusRange: 7 }, { position: [0, 1.2, 8.5] }),
        ],
        clips: [
          showcaseClip('carousel_turn', 'Carousel turn', 8, 'carousel', [
            {
              property: 'rotation.y',
              keys: [
                { time: 0, value: 0, easing: LINEAR },
                { time: 8, value: Math.PI * 2, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
    ],
  },
  {
    id: 'code-slab',
    name: 'Code slab',
    category: 'Product',
    description: 'A floating code card with a deep beveled body, angled into a dark studio and settling to camera.',
    width: 1920,
    height: 1080,
    fps: 30,
    tags: ['3d', 'code', 'ui', 'developer', 'studio', 'product'],
    scenes: [
      {
        name: 'Code slab',
        duration: 5,
        cameraId: 'cam',
        background: { type: 'studio', variant: 'dark', color: '#07090f', intensity: 1.2 },
        nodes: [
          node('light.directional', 'key', { intensity: 2.2, color: '#dfe8ff' }, { position: [4, 4, 6] }),
          node('light.point', 'rim', { intensity: 3.4, color: '#59f0a8', distance: 14 }, { position: [-4, 1, -2] }),
          node('ui.code', 'code', {
            width: 3.5,
            height: 2.15,
            depth: 0.18,
            bevel: 0.03,
            title: 'scene.tsx',
            language: 'TSX',
            code: [
              'export function Scene() {',
              '  const frame = useMotion();',
              '  return <Stage frame={frame} />;',
              '}',
            ].join('\n'),
            fontSize: 0.082,
            accentColor: '#59f0a8',
            background: '#0b1119',
          }, { rotation: [0.08, -0.5, 0] }),
          node('text.body', 'caption', {
            text: 'Every frame is a function of time.',
            fontSize: 0.16,
            color: '#9fb0c9',
            maxWidth: 7,
          }, { position: [0, -1.65, 0] }),
          node('camera.perspective', 'cam', { fov: 30, aim: 'origin' }, { position: [1.8, 1.1, 5.6] }),
        ],
        clips: [
          showcaseClip('code_settle', 'Code settle', 5, 'code', [
            {
              property: 'rotation.y',
              keys: [
                { time: 0, value: -0.5, easing: SMOOTH },
                { time: 2.4, value: 0.02, easing: LINEAR },
              ],
            },
            {
              property: 'position.y',
              keys: [
                { time: 0, value: 0, easing: SMOOTH },
                { time: 2.4, value: 0.04, easing: LINEAR },
              ],
            },
          ]),
          showcaseClip('caption_in', 'Caption in', 5, 'caption', [
            {
              property: 'opacity',
              keys: [
                { time: 1.1, value: 0, easing: EASE_OUT },
                { time: 2, value: 1, easing: LINEAR },
              ],
            },
          ]),
        ],
      },
    ],
  },
];

function stackPlate(index: number, label: string, accent: string): ReturnType<typeof node>[] {
  const group = node('scene.group', `plate_${index}`, {}, { position: [0, index * 0.24 - 0.36, 0] });
  const body = node('geometry.rounded-box', `plate_body_${index}`, {
    width: 2.5,
    height: 0.18,
    depth: 2.5,
    radius: 0.07,
    segments: 4,
    color: '#ffffff',
    roughness: 0.6,
    metalness: 0.05,
  });
  body.parentId = group.id;
  const stripe = node('geometry.rounded-box', `plate_stripe_${index}`, {
    width: 2.5,
    height: 0.02,
    depth: 2.5,
    radius: 0.02,
    segments: 2,
    color: accent,
    roughness: 0.4,
    metalness: 0.1,
  }, { position: [0, 0.1, 0] });
  stripe.parentId = group.id;
  const caption = node('text.body', `plate_label_${index}`, {
    text: label,
    fontSize: 0.17,
    color: '#20242c',
    maxWidth: 4,
    align: 'left',
  }, { position: [2.3, index * 1.18 - 0.2, 0] });
  return [group, body, stripe, caption];
}

function stackPlateClip(index: number) {
  const base = index * 0.24 - 0.36;
  const exploded = index * 1.18 - 0.5;
  return [
    showcaseClip(`plate_${index}_rise`, `Plate ${index + 1} rise`, 5.5, `plate_${index}`, [
      {
        property: 'position.y',
        keys: [
          { time: 0, value: base, easing: SMOOTH },
          { time: 0.9, value: base, easing: SMOOTH },
          { time: 1.7, value: exploded, easing: EASE_OUT },
          { time: 4.2, value: exploded, easing: LINEAR },
          { time: 5.1, value: base, easing: SMOOTH },
        ],
      },
    ]),
  ];
}

function stackLabelClip(index: number) {
  return [
    showcaseClip(`plate_${index}_label`, `Plate ${index + 1} label`, 5.5, `plate_label_${index}`, [
      {
        property: 'opacity',
        keys: [
          { time: 2, value: 0, easing: EASE_OUT },
          { time: 2.5, value: 1, easing: LINEAR },
          { time: 4.2, value: 1, easing: LINEAR },
          { time: 4.6, value: 0, easing: LINEAR },
        ],
      },
    ]),
  ];
}

function carouselCards(): ReturnType<typeof node>[] {
  const cards: ReturnType<typeof node>[] = [];
  const count = 5;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const card = node('ui.card', `card_${i}`, {
      width: 1.8,
      height: 2.45,
      depth: 0.12,
      cornerRadius: 0.12,
      bevel: 0.025,
      tag: `0${i + 1}`,
      title: ['Frame exact', 'One timeline', 'Live materials', 'Studio light', 'Export clean'][i],
      body: 'Every card is a scene node with printed content and real bevel lighting.',
      background: i % 2 === 0 ? '#121821' : '#171d28',
      color: '#f2f6ff',
      accentColor: '#7aa2ff',
    }, {
      position: [Math.sin(angle) * 3.1, 0.25, Math.cos(angle) * 3.1],
      rotation: [0, angle, 0],
    });
    card.parentId = 'carousel';
    cards.push(card);
  }
  return cards;
}