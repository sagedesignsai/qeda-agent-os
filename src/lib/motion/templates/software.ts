import { node, type TemplateSpec } from './spec';
import { driftClip, popInClip, pushInClip, riseInClip } from './shared';

export const softwareTemplates: TemplateSpec[] = [
  {
    id: 'saas-demo',
    name: 'SaaS product demo',
    category: 'Software',
    description: 'Hook, browser walkthrough, code + API, CTA.',
    width: 1920, height: 1080,
    tags: ['saas', 'software'],
    scenes: [
      {
        name: 'Hook',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('stage.backdrop', 'bd', { topColor: '#1a2340', bottomColor: '#070a12' }, { position: [0, 0.5, -3.5] }),
          node('text.title', 'title', { text: 'Ship faster', fontSize: 0.4 }, { position: [0, 0.2, 1] }),
          node('text.body', 'sub', { text: 'A product story, rendered frame by frame.', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.3, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          pushInClip('s1_push', 'cam', 4, { to: 7, from: 8.1 }),
          riseInClip('s1_title', 'title', 4, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.3 }),
          riseInClip('s1_sub', 'sub', 4, { delay: 0.9, fade: 0.8, y: -0.3, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Browser walkthrough',
        duration: 8,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('ui.browser', 'browser', { label: 'Studio — Overview' }, { position: [0, 0.3, 0] }),
          node('ui.annotation', 'callout', { title: 'Live preview', body: 'Scrub the timeline.' }, { position: [2.7, 1.1, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0.2, 8] }),
        ],
        clips: [
          driftClip('s2_drift', 'cam', 8, { axis: 'position.x', from: -0.3, to: 0 }),
          riseInClip('s2_browser', 'browser', 8, { delay: 0.35, fade: 1, y: 0.3, lift: 0.3 }),
          riseInClip('s2_callout', 'callout', 8, { delay: 1.3, fade: 0.9, y: 1.1, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'Code + API',
        duration: 8,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('ui.code', 'code', { title: 'hero.tsx', language: 'TSX' }, { position: [-2.4, 0, 0] }),
          node('ui.terminal', 'term', { lines: ['$ bun run build', '✓ built'] }, { position: [2.4, 0, 0] }),
          node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 8] }),
        ],
        clips: [
          pushInClip('s3_push', 'cam', 8, { to: 8, from: 8.9 }),
          riseInClip('s3_code', 'code', 8, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
          riseInClip('s3_term', 'term', 8, { delay: 1.0, fade: 0.9, y: 0, lift: 0.3 }),
        ],
        cameraId: 'cam',
      },
      {
        name: 'CTA',
        duration: 4,
        nodes: [
          node('light.ambient', 'l1', { intensity: 1.2 }),
          node('graphic.badge', 'badge', { text: 'v2.0', background: '#5885f7' }, { position: [0, 0.7, 1] }),
          node('text.title', 'title', { text: 'Start building', fontSize: 0.34 }, { position: [0, 0.1, 1] }),
          node('text.body', 'sub', { text: 'qeda.app', fontSize: 0.14, color: '#9fb0c9' }, { position: [0, -0.4, 1] }),
          node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] }),
        ],
        clips: [
          popInClip('s4_badge', 'badge', 4, { delay: 0.35 }),
          riseInClip('s4_title', 'title', 4, { delay: 0.6, fade: 0.9, y: 0.1, lift: 0.3 }),
          riseInClip('s4_sub', 'sub', 4, { delay: 1.0, fade: 0.8, y: -0.4, lift: 0.25 }),
        ],
        cameraId: 'cam',
      },
    ],
  },
  {
    id: 'dev-explainer',
    name: 'Developer explainer',
    category: 'Software',
    description: 'Problem, terminal, code, browser result, CTA.',
    width: 1920, height: 1080,
    tags: ['dev', 'explainer'],
    scenes: [
      { name: 'Problem', duration: 5, nodes: [node('light.ambient', 'l1', { intensity: 1.2 }), node('text.title', 't', { text: 'The problem', fontSize: 0.34 }, { position: [0, 0.2, 1] }), node('text.body', 'b', { text: 'Manual work is slow.', fontSize: 0.16, color: '#9fb0c9' }, { position: [0, -0.3, 1] }), node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] })],
        clips: [
          pushInClip('s1_push', 'cam', 5, { to: 7, from: 7.8 }),
          riseInClip('s1_title', 't', 5, { delay: 0.35, fade: 0.9, y: 0.2, lift: 0.3 }),
          riseInClip('s1_sub', 'b', 5, { delay: 0.9, fade: 0.8, y: -0.3, lift: 0.25 }),
        ], cameraId: 'cam' },
      { name: 'Terminal', duration: 6, nodes: [node('light.ambient', 'l1', { intensity: 1.2 }), node('ui.terminal', 'term', { lines: ['$ qeda init', '✓ project created'] }, { position: [0, 0, 0] }), node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 6] })],
        clips: [
          riseInClip('s2_term', 'term', 6, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
          driftClip('s2_drift', 'cam', 6, { axis: 'position.x', from: 0.3, to: 0 }),
        ], cameraId: 'cam' },
      { name: 'Code', duration: 6, nodes: [node('light.ambient', 'l1', { intensity: 1.2 }), node('ui.code', 'code', { title: 'index.ts' }, { position: [0, 0, 0] }), node('camera.perspective', 'cam', { fov: 34 }, { position: [0, 0, 6] })],
        clips: [
          riseInClip('s3_code', 'code', 6, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
        ], cameraId: 'cam' },
      { name: 'Result', duration: 6, nodes: [node('light.ambient', 'l1', { intensity: 1.2 }), node('ui.browser', 'browser', { label: 'Result' }, { position: [0, 0, 0] }), node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 8] })],
        clips: [
          riseInClip('s4_browser', 'browser', 6, { delay: 0.35, fade: 1, y: 0, lift: 0.3 }),
        ], cameraId: 'cam' },
      { name: 'CTA', duration: 4, nodes: [node('light.ambient', 'l1', { intensity: 1.2 }), node('text.title', 't', { text: 'Start today', fontSize: 0.34 }, { position: [0, 0.1, 1] }), node('camera.perspective', 'cam', { fov: 32 }, { position: [0, 0, 7] })],
        clips: [
          pushInClip('s5_push', 'cam', 4, { to: 7, from: 7.7 }),
          riseInClip('s5_title', 't', 4, { delay: 0.35, fade: 0.9, y: 0.1, lift: 0.3 }),
        ], cameraId: 'cam' },
    ],
  },
];
