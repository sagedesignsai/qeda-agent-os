import { node, type TemplateSpec } from './spec';
import { popInClip, pushInClip, riseInClip } from './shared';

export const eventTemplates: TemplateSpec[] = [
  {
    id: 'webinar-promo',
    name: 'Webinar promo',
    category: 'Event',
    description: 'Title + date, speakers, register.',
    width: 1920, height: 1080,
    tags: ['webinar', 'event'],
    scenes: [
      {
        name: 'Title + date',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Live Webinar', fontSize: 0.34 }, { position: [0, 0.3, 1] }),
          node('text.body', 'd', { text: 'Thursday, Nov 12 · 2pm ET', fontSize: 0.16, color: '#9fb0c9' }, { position: [0, -0.3, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 5, { to: 7, from: 7.9 }),
          riseInClip('s1_title', 't', 5, { delay: 0.35, fade: 0.9, y: 0.3, lift: 0.3 }),
          riseInClip('s1_date', 'd', 5, { delay: 0.9, fade: 0.8, y: -0.3, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Speakers',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.lower-third', 'sp1', { name: 'Jane Doe', title: 'Head of Product' }, { position: [0, 0.4, 1] }),
          node('graphic.lower-third', 'sp2', { name: 'John Roe', title: 'Lead Engineer' }, { position: [0, -0.7, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          riseInClip('s2_sp1', 'sp1', 5, { delay: 0.35, fade: 0.9, y: 0.4, lift: 0.25 }),
          riseInClip('s2_sp2', 'sp2', 5, { delay: 1.3, fade: 0.9, y: -0.7, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Register',
        duration: 5,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('text.title', 't', { text: 'Register now', fontSize: 0.34 }, { position: [0, 0.2, 1] }),
          node('graphic.badge', 'badge', { text: 'FREE', background: '#59c7a6' }, { position: [0, 0.9, 1] }),
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
