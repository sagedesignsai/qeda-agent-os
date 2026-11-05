import { node, type TemplateSpec } from './spec';
import { countUpClip, driftClip, popInClip, pushInClip, riseInClip } from './shared';

export const dataTemplates: TemplateSpec[] = [
  {
    id: 'quarterly-data-story',
    name: 'Quarterly data story',
    category: 'Data',
    description: 'Headline KPI, trend chart, breakdown, summary.',
    width: 1920, height: 1080,
    tags: ['data', 'report'],
    scenes: [
      {
        name: 'Headline KPI',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.kpi', 'kpi', { value: 12840, label: 'Monthly active users', delta: 0.12, deltaLabel: '+12% vs last quarter' }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          countUpClip('s1_kpi', 'kpi', 'value', 5, { delay: 0.4, to: 12840, ramp: 2.6 }),
          riseInClip('s1_in', 'kpi', 5, { delay: 0.25, fade: 0.8, y: 0, lift: 0.3 }),
          pushInClip('s1_push', 'cam', 5, { to: 7, from: 7.8 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Trend',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.line-chart', 'chart', { values: [3, 5, 4, 7, 6, 9, 8, 10, 12, 11], width: 6, height: 2.4 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          countUpClip('s2_reveal', 'chart', 'progress', 6, { delay: 0.4, to: 1, ramp: 3.2 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: -0.3, to: 0 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Breakdown',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.donut-chart', 'donut', { segments: [{ value: 42, color: '#5885f7', label: 'Product' }, { value: 28, color: '#59c7a6', label: 'Services' }, { value: 30, color: '#a88cf7', label: 'Other' }], radius: 1.2 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          countUpClip('s3_reveal', 'donut', 'progress', 6, { delay: 0.4, to: 1, ramp: 3.2 }),
          riseInClip('s3_in', 'donut', 6, { delay: 0.25, fade: 0.8, y: 0, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Summary',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.stat-grid', 'grid', { width: 6, height: 3 }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s4_grid', 'grid', 5, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
          pushInClip('s4_push', 'cam', 5, { to: 7, from: 7.7 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'pitch-intro',
    name: 'Pitch intro',
    category: 'Data',
    description: 'Mission, traction, ask.',
    width: 1920, height: 1080,
    tags: ['pitch', 'investor'],
    scenes: [
      {
        name: 'Mission',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'We build tools for makers', fontSize: 0.32 }, { position: [0, 0.2, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 5, { to: 7, from: 7.9 }),
          riseInClip('s1_title', 't', 5, { delay: 0.35, fade: 1, y: 0.2, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Traction',
        duration: 6,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.bar-chart', 'chart', { values: [2, 5, 9, 14, 22], width: 5, height: 2.2, color: '#59c7a6' }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          countUpClip('s2_reveal', 'chart', 'progress', 6, { delay: 0.4, to: 1, ramp: 3.2 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: 0.3, to: 0 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Ask',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Raising $2M seed', fontSize: 0.32 }, { position: [0, 0.2, 1] }),
          node('graphic.badge', 'badge', { text: 'SEED', background: '#59c7a6' }, { position: [0, 0.9, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          popInClip('s3_badge', 'badge', 5, { delay: 0.35 }),
          riseInClip('s3_title', 't', 5, { delay: 0.65, fade: 0.9, y: 0.2, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
];
