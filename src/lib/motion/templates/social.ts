import { node, type TemplateSpec } from './spec';
import { popInClip, pushInClip, riseInClip, spinClip } from './shared';

export const socialTemplates: TemplateSpec[] = [
  {
    id: 'social-ad',
    name: 'Social ad',
    category: 'Social',
    description: 'Problem, product, offer.',
    width: 1080, height: 1080,
    tags: ['social', 'ad'],
    scenes: [
      {
        name: 'Problem',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Tired of slow tools?', fontSize: 0.24 }, { position: [0, 0.2, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 6] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 4, { to: 6, from: 6.8 }),
          riseInClip('s1_title', 't', 4, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Product',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          // Bundled sneaker: staged + fit-baked at project creation (fitHeight
          // 0.8 keeps the 0.15-unit-tall model at product-hero size).
          node('model.gltf', 'hero', { assetId: 'local:khronos/MaterialsVariantsShoe', fitHeight: 0.8, restBottom: -1.1 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 6] }),
        ],
        clips: [
          spinClip('s2_spin', 'hero', 4, { turns: 1 }),
          popInClip('s2_pop', 'hero', 4, { delay: 0.2 }),
          pushInClip('s2_push', 'cam', 4, { to: 6, from: 6.7 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Offer',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.badge', 'badge', { text: '20% OFF', background: '#e33a2c', fontSize: 0.22 }, { position: [0, 0.6, 1] }),
          node('text.title', 't', { text: 'Shop now', fontSize: 0.3 }, { position: [0, 0, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          popInClip('s3_badge', 'badge', 4, { delay: 0.35 }),
          riseInClip('s3_title', 't', 4, { delay: 0.65, fade: 0.9, y: 0, lift: 0.25 }),
          pushInClip('s3_push', 'cam', 4, { to: 7, from: 7.6 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
];
