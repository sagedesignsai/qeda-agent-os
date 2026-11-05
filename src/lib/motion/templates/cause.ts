import { node, type TemplateSpec } from './spec';
import { countUpClip, popInClip, pushInClip, riseInClip } from './shared';

export const causeTemplates: TemplateSpec[] = [
  {
    id: 'nonprofit-campaign',
    name: 'Nonprofit campaign',
    category: 'Cause',
    description: 'Issue, impact stat, donate.',
    width: 1080, height: 1920,
    tags: ['nonprofit', 'campaign'],
    scenes: [
      {
        name: 'Issue',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Every drop counts', fontSize: 0.3 }, { position: [0, 0.3, 1] }),
          node('text.body', 'b', { text: 'Clean water for every community.', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.3, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 5, { to: 7, from: 7.9 }),
          riseInClip('s1_title', 't', 5, { delay: 0.35, fade: 0.9, y: 0.3, lift: 0.3 }),
          riseInClip('s1_sub', 'b', 5, { delay: 0.9, fade: 0.8, y: -0.3, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Impact',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('data.kpi', 'kpi', { value: 12000, label: 'Families helped', delta: 0.3, deltaLabel: '+30% this year' }, { position: [0, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 7] }),
        ],
        clips: [
          countUpClip('s2_kpi', 'kpi', 'value', 5, { delay: 0.4, to: 12000, ramp: 2.8 }),
          riseInClip('s2_in', 'kpi', 5, { delay: 0.25, fade: 0.8, y: 0, lift: 0.3 }),
          pushInClip('s2_push', 'cam', 5, { to: 7, from: 7.7 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Donate',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Donate today', fontSize: 0.34 }, { position: [0, 0.2, 1] }),
          node('graphic.badge', 'badge', { text: 'GIVE', background: '#59c7a6' }, { position: [0, 0.9, 1] }),
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
