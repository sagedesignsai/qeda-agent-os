import { node, type TemplateSpec } from './spec';
import { driftClip, fadeInClip, pushInClip, riseInClip } from './shared';

export const editorialTemplates: TemplateSpec[] = [
  {
    id: 'real-estate-tour',
    name: 'Real estate tour',
    category: 'Editorial',
    description: 'Exterior, interior montage, details + CTA.',
    width: 1920, height: 1080,
    tags: ['real-estate', 'tour'],
    scenes: [
      {
        name: 'Exterior',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.backdrop', 'bd', { topColor: '#87a8c4', bottomColor: '#e8eef8' }, { position: [0, 0.5, -3.5] }),
          node('text.title', 't', { text: '123 Maple Street', fontSize: 0.3, color: '#151b26' }, { position: [0, -1.6, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 6, { to: 7, from: 8.1 }),
          riseInClip('s1_title', 't', 6, { delay: 0.4, fade: 1, y: -1.6, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Interior',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('ui.browser', 'browser', { label: 'Interior tour' }, { position: [0, 0.3, 0] }),
          // Bundled chair as foreground staging: fades in next to the tour
          // window and yaws gently, so the scene reads as a dressed set.
          node('model.gltf', 'chair', { assetId: 'local:threejs/SheenChair', fitHeight: 1.2, restBottom: -1.7 }, { position: [-2.9, 0, 1.4] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 8] }),
        ],
        clips: [
          riseInClip('s2_browser', 'browser', 6, { delay: 0.35, fade: 1, y: 0.3, lift: 0.3 }),
          fadeInClip('s2_chair', 'chair', 6, { delay: 0.8, fade: 1.2 }),
          driftClip('s2_chair_drift', 'chair', 6, { axis: 'rotation.y', from: -0.25, to: 0.15 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: -0.3, to: 0 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Details + CTA',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.stat-grid', 'grid', { items: [{ value: '4', label: 'Beds' }, { value: '3', label: 'Baths' }, { value: '2,400', label: 'Sqft' }, { value: '$890k', label: 'Price' }], columns: 2, width: 5, height: 2.4 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s3_grid', 'grid', 6, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
          pushInClip('s3_push', 'cam', 6, { to: 7, from: 7.8 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
];
