import { node, type TemplateSpec } from './spec';
import { countUpClip, driftClip, fadeInClip, popInClip, pushInClip, riseInClip, spinClip } from './shared';

export const commerceTemplates: TemplateSpec[] = [
  {
    id: 'product-launch-film',
    name: 'Product launch film',
    category: 'Commerce',
    description: 'A multi-scene product film: tease, reveal, features, CTA.',
    width: 1920, height: 1080,
    tags: ['product', 'launch', 'film'],
    scenes: [
      {
        name: 'Tease',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 0.6 }),
          node('light.spot', 'spot1', { intensity: 4, color: '#5885f7' }, { position: [0, 4, 3] }),
          node('stage.particles', 'particles', { count: 600, color: '#5885f7', radius: 5 }),
          node('camera.perspective', 'cam', { fov: 30 }, { position: [0, 0, 7] }),
          node('text.title', 'tease', { text: 'Something new', fontSize: 0.35, opacity: 0.6 }, { position: [0, 0, 0] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 4, { to: 7, from: 8.2 }),
          countUpClip('s1_glow', 'spot1', 'intensity', 4, { from: 2.6, to: 5.2, delay: 0.4, ramp: 2.2 }),
          fadeInClip('s1_particles', 'particles', 4, { delay: 0.2, fade: 1.4, to: 0.8 }),
          riseInClip('s1_tease', 'tease', 4, { delay: 0.5, fade: 1, to: 0.6, y: 0, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Reveal',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('light.directional', 'key', { intensity: 2.2 }, { position: [-3.5, 5, 5] }),
          node('stage.pedestal', 'ped', {}, { position: [0, -0.75, 0] }),
          // Bundled catalog model: staged into the project at creation, then
          // fit-baked to `fitHeight` with its floor on the pedestal top
          // (`restBottom`). The node id stays `product` so the spin clip
          // targets the watch, not the pedestal.
          node('model.gltf', 'product', { assetId: 'local:khronos/ChronographWatch', fitHeight: 1.2, restBottom: -0.6 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0.3, 7.5] }),
          node('text.title', 'title', { text: 'The product', fontSize: 0.3 }, { position: [0, -1.6, 0.8] }),
        ],
        clips: [
          spinClip('s2_spin', 'product', 6, { turns: 1 }),
          pushInClip('s2_push', 'cam', 6, { to: 7.5, from: 8.6 }),
          riseInClip('s2_title', 'title', 6, { delay: 0.5, fade: 1, y: -1.6, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Features',
        duration: 8,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('light.directional', 'key', { intensity: 2.2 }, { position: [-3.5, 5, 5] }),
          node('ui.browser', 'browser', { label: 'Product overview' }, { position: [0, 0.3, 0] }),
          node('ui.annotation', 'callout', { title: 'Fast', body: 'Renders in seconds.' }, { position: [2.7, 1.1, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0.2, 8] }),
          node('text.title', 'title', { text: 'Built for speed', fontSize: 0.28 }, { position: [0, -2.0, 0.8] }),
        ],
        clips: [
          driftClip('s3_drift', 'cam', 8, { axis: 'position.x', from: -0.35, to: 0 }),
          riseInClip('s3_browser', 'browser', 8, { delay: 0.4, fade: 1, y: 0.3, lift: 0.3 }),
          riseInClip('s3_callout', 'callout', 8, { delay: 1.3, fade: 0.9, y: 1.1, lift: 0.25 }),
          riseInClip('s3_title', 'title', 8, { delay: 0.9, fade: 1, y: -2.0, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'CTA',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.backdrop', 'bd', { topColor: '#1a2340', bottomColor: '#070a12' }, { position: [0, 0.5, -3.5] }),
          node('graphic.badge', 'badge', { text: 'NEW', fontSize: 0.22, background: '#5885f7' }, { position: [0, 0.6, 1] }),
          node('text.title', 'title', { text: 'Get started today', fontSize: 0.32 }, { position: [0, 0, 1] }),
          node('text.body', 'sub', { text: 'qeda.app', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.5, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s4_push', 'cam', 6, { to: 7, from: 8.0 }),
          popInClip('s4_badge', 'badge', 6, { delay: 0.4 }),
          riseInClip('s4_title', 'title', 6, { delay: 0.7, fade: 1, y: 0, lift: 0.3 }),
          riseInClip('s4_sub', 'sub', 6, { delay: 1.2, fade: 0.9, y: -0.5, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'beverage-launch',
    name: 'Beverage launch',
    category: 'Commerce',
    description: 'Vertical can hero, ingredients, CTA.',
    width: 1080, height: 1920,
    tags: ['beverage', 'vertical', 'launch'],
    scenes: [
      {
        name: 'Hero',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('light.directional', 'key', { intensity: 2.4 }, { position: [-2, 4, 4] }),
          node('stage.pedestal', 'ped', { radius: 0.9, height: 0.3 }, { position: [0, -0.9, 0] }),
          node('product.can', 'can', { bodyColor: '#e33a2c', accentColor: '#ffffff' }, { position: [0, -0.2, 0], scale: [1.6, 1.6, 1.6] }),
          node('camera.perspective', 'cam', { fov: 30 }, { position: [0, 0.4, 6] }),
        ],
        clips: [
          spinClip('s1_spin', 'can', 5, { turns: 1 }),
          pushInClip('s1_push', 'cam', 5, { to: 6, from: 7.2 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Ingredients',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.stat-grid', 'stats', { items: [{ value: '0g', label: 'Sugar' }, { value: '100%', label: 'Natural' }, { value: '45cal', label: 'Per can' }, { value: 'B12', label: 'Vitamin' }], columns: 2, width: 6, height: 4 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          driftClip('s2_drift', 'cam', 5, { axis: 'position.x', from: -0.25, to: 0 }),
          riseInClip('s2_stats', 'stats', 5, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'CTA',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.badge', 'badge', { text: 'NEW FLAVOR', background: '#e33a2c' }, { position: [0, 0.8, 1] }),
          node('text.title', 'title', { text: 'Try it today', fontSize: 0.4, color: '#ffffff' }, { position: [0, 0, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          popInClip('s3_badge', 'badge', 5, { delay: 0.4 }),
          riseInClip('s3_title', 'title', 5, { delay: 0.8, fade: 1, y: 0, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'skincare-routine',
    name: 'Skincare routine',
    category: 'Commerce',
    description: 'Jar + tube hero, texture, CTA.',
    width: 1080, height: 1920,
    tags: ['cosmetics', 'vertical'],
    scenes: [
      {
        name: 'Hero',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.1 }),
          node('light.directional', 'key', { intensity: 2 }, { position: [-3, 4, 4] }),
          node('stage.pedestal', 'ped', { radius: 1.1, height: 0.4, color: '#f2efe9' }, { position: [0, -0.8, 0] }),
          node('product.jar', 'jar', { bodyColor: '#f2efe9', lidColor: '#c9bfae' }, { position: [-0.5, -0.35, 0.2] }),
          node('product.tube', 'tube', { bodyColor: '#e8eef8' }, { position: [0.5, -0.2, -0.2], rotation: [0, -0.4, 0.1] }),
          node('camera.perspective', 'cam', { fov: 30 }, { position: [0, 0.3, 6] }),
        ],
        clips: [
          spinClip('s1_jar', 'jar', 5, { turns: 0.5 }),
          pushInClip('s1_push', 'cam', 5, { to: 6, from: 6.9 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Texture',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.progress-bar', 'bar', { progress: 0.88, label: 'Hydration', valueLabel: '88%', width: 4, color: '#59c7a6' }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 6] }),
        ],
        clips: [
          countUpClip('s2_bar', 'bar', 'progress', 5, { delay: 0.5, to: 0.88, ramp: 2.4 }),
          riseInClip('s2_reveal', 'bar', 5, { delay: 0.3, fade: 0.8, y: 0, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'CTA',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 'title', { text: 'Glow daily', fontSize: 0.4, color: '#151b26' }, { position: [0, 0.2, 1] }),
          node('text.body', 'sub', { text: 'Clean ingredients. Visible results.', fontSize: 0.14, color: '#46505f' }, { position: [0, -0.3, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s3_title', 'title', 5, { delay: 0.4, fade: 1, y: 0.2, lift: 0.3 }),
          riseInClip('s3_sub', 'sub', 5, { delay: 0.9, fade: 0.9, y: -0.3, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
];
