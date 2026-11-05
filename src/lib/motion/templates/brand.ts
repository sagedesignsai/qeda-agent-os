import { node, type TemplateSpec } from './spec';
import { driftClip, fadeInClip, pushInClip, riseInClip, spinClip } from './shared';

export const brandTemplates: TemplateSpec[] = [
  {
    id: 'brand-sting',
    name: 'Brand sting',
    category: 'Brand',
    description: 'Minimal animated brand title on a clean stage.',
    width: 1920, height: 1080,
    tags: ['brand', 'sting'],
    scenes: [
      {
        name: 'Mark build',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.grid', 'grid', { size: 12, divisions: 12, accentColor: '#5885f7' }, { position: [0, -1.5, 0] }),
          node('procedural.radial', 'mark', { primitive: 'box', count: 8, radius: 1.2, color: '#5885f7', size: 0.18 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 6] }),
        ],
        clips: [
          spinClip('s1_mark', 'mark', 4, { turns: 1 }),
          pushInClip('s1_push', 'cam', 4, { to: 6, from: 7.1 }),
          riseInClip('s1_grid', 'grid', 4, { delay: 0.2, fade: 1, y: -1.5, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Wordmark',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 'title', { text: 'Your brand', fontSize: 0.4, letterSpacing: 0.02 }, { position: [0, 0.2, 1], scale: [1.2, 1.2, 1.2] }),
          node('text.body', 'tag', { text: 'Design in motion', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.4, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s2_push', 'cam', 4, { to: 7, from: 7.9 }),
          riseInClip('s2_title', 'title', 4, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.3 }),
          riseInClip('s2_tag', 'tag', 4, { delay: 0.9, fade: 0.8, y: -0.4, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'title-sequence',
    name: 'Title sequence',
    category: 'Brand',
    description: 'Main title then credit roll.',
    width: 1920, height: 1080,
    tags: ['title', 'credits'],
    scenes: [
      {
        name: 'Main title',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.backdrop', 'bd', { topColor: '#070a12', bottomColor: '#000000' }, { position: [0, 0.5, -3.5] }),
          node('text.title', 'title', { text: 'The Title', fontSize: 0.5 }, { position: [0, 0, 1] }),
          node('text.body', 'sub', { text: 'A film by Qeda', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.7, 1] }),
          node('camera.perspective', 'cam', { fov: 30 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 6, { to: 7, from: 8.2 }),
          riseInClip('s1_title', 'title', 6, { delay: 0.4, fade: 1, y: 0, lift: 0.3 }),
          riseInClip('s1_sub', 'sub', 6, { delay: 1.1, fade: 1, y: -0.7, lift: 0.2 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Credits',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.body', 'c1', { text: 'Director — Jane Doe', fontSize: 0.16 }, { position: [0, 1.2, 1] }),
          node('text.body', 'c2', { text: 'Producer — John Roe', fontSize: 0.16 }, { position: [0, 0.6, 1] }),
          node('text.body', 'c3', { text: 'Music — Studio A', fontSize: 0.16 }, { position: [0, 0, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          fadeInClip('s2_c1', 'c1', 6, { delay: 0.3, fade: 0.8 }),
          fadeInClip('s2_c2', 'c2', 6, { delay: 1.3, fade: 0.8 }),
          fadeInClip('s2_c3', 'c3', 6, { delay: 2.3, fade: 0.8 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: 0.2, to: 0 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
];
