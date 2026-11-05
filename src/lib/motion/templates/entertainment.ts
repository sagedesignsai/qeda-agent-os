import { node, type TemplateSpec } from './spec';
import { countUpClip, driftClip, popInClip, pushInClip, riseInClip, spinClip } from './shared';

export const entertainmentTemplates: TemplateSpec[] = [
  {
    id: 'mobile-app-trailer',
    name: 'Mobile app trailer',
    category: 'Entertainment',
    description: 'Phone hero, features, rating, download.',
    width: 1080, height: 1920,
    tags: ['mobile', 'app', 'trailer'],
    scenes: [
      {
        name: 'Phone hero',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('device.phone', 'phone', {}, { position: [0, 0, 0], scale: [1.4, 1.4, 1.4] }),
          node('camera.perspective', 'cam', { fov: 30 }, { position: [0, 0, 6] }),
        ],
        clips: [
          popInClip('s1_phone', 'phone', 5, { delay: 0.2, base: 1.4, from: 1.05 }),
          pushInClip('s1_push', 'cam', 5, { to: 6, from: 6.9 }),
          driftClip('s1_drift', 'cam', 5, { axis: 'position.x', from: 0.2, to: 0 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Features',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('ui.chat', 'chat', { width: 2.6 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 6] }),
        ],
        clips: [
          riseInClip('s2_chat', 'chat', 6, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: 0.25, to: 0 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Rating',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.badge', 'badge', { text: '4.9 ★', background: '#59c7a6', fontSize: 0.2 }, { position: [0, 0.6, 1] }),
          node('text.title', 't', { text: 'Loved by users', fontSize: 0.3 }, { position: [0, 0, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          popInClip('s3_badge', 'badge', 4, { delay: 0.35 }),
          riseInClip('s3_title', 't', 4, { delay: 0.65, fade: 0.9, y: 0, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Download',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Download now', fontSize: 0.34 }, { position: [0, 0.2, 1] }),
          node('text.body', 'b', { text: 'Available on iOS and Android', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.3, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s4_push', 'cam', 5, { to: 7, from: 7.8 }),
          riseInClip('s4_title', 't', 5, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.3 }),
          riseInClip('s4_sub', 'b', 5, { delay: 0.9, fade: 0.8, y: -0.3, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'game-showcase',
    name: 'Game showcase',
    category: 'Entertainment',
    description: 'Key art, character turntable, platforms.',
    width: 1920, height: 1080,
    tags: ['game', 'showcase'],
    scenes: [
      {
        name: 'Key art',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.backdrop', 'bd', { topColor: '#243049', bottomColor: '#06080d' }, { position: [0, 0.5, -3.5] }),
          node('geometry.torus-knot', 'knot', { color: '#a88cf7' }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          spinClip('s1_knot', 'knot', 5, { turns: 1 }),
          pushInClip('s1_push', 'cam', 5, { to: 7, from: 7.9 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Turntable',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('light.spot', 'spot', { intensity: 4 }, { position: [3, 5, 3] }),
          // Bundled character: staged + fit-baked at project creation; the
          // model sits ~1 unit off author-space ground so restBottom is used.
          node('model.gltf', 'model', { assetId: 'local:khronos/CesiumMan', fitHeight: 1.5, restBottom: -0.5 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0.5, 6] }),
        ],
        clips: [
          spinClip('s2_model', 'model', 6, { turns: 1 }),
          riseInClip('s2_model_in', 'model', 6, { delay: 0.25, fade: 0.8, y: 0, lift: 0.2 }),
          countUpClip('s2_spot', 'spot', 'intensity', 6, { delay: 0.3, from: 2.2, to: 4, ramp: 2.4 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: -0.25, to: 0 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Platforms',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Available now', fontSize: 0.3 }, { position: [0, 0.2, 1] }),
          node('text.body', 'b', { text: 'PC · PlayStation · Xbox', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.3, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s3_title', 't', 4, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.25 }),
          riseInClip('s3_sub', 'b', 4, { delay: 0.85, fade: 0.8, y: -0.3, lift: 0.2 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'podcast-visualizer',
    name: 'Podcast visualizer',
    category: 'Entertainment',
    description: 'Cover art, waveform, episode info.',
    width: 1080, height: 1080,
    tags: ['podcast', 'audio'],
    scenes: [
      {
        name: 'Cover',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.backdrop', 'bd', { topColor: '#2a3344', bottomColor: '#0e131c' }, { position: [0, 0, -3] }),
          node('text.title', 't', { text: 'Episode 42', fontSize: 0.3 }, { position: [0, 0.2, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 6] }),
        ],
        clips: [
          driftClip('s1_drift', 'cam', 5, { axis: 'position.x', from: -0.25, to: 0 }),
          riseInClip('s1_title', 't', 5, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Waveform',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.waveform', 'wave', { bars: 40, width: 6, height: 1.2, color: '#59c7a6' }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s2_wave', 'wave', 5, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
          pushInClip('s2_push', 'cam', 5, { to: 7, from: 7.8 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Episode info',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.lower-third', 'lt', { name: 'Host Name', title: 'The Podcast' }, { position: [0, 0, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s3_lt', 'lt', 5, { delay: 0.35, fade: 0.9, y: 0, lift: 0.3 }),
          pushInClip('s3_push', 'cam', 5, { to: 7, from: 7.7 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
];
