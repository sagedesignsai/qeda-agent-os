/**
 * lib/motion/templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Script-free Motion starter templates and factories. Template metadata is
 * serializable data; factory logic only clones and configures known node types.
 */

import { createEmptyMotionDocument, createStarterMotionDocument } from './defaults';
import { EASING_PRESETS } from './easing';
import { createMotionNode } from './node-registry';
import type {
  MotionClip,
  MotionDocument,
  MotionEasing,
  MotionNode,
  MotionTimeline,
} from './types';

export type MotionTemplate = {
  id: string;
  name: string;
  category: 'Product' | 'Social' | 'Brand';
  description: string;
  duration: number;
  width: number;
  height: number;
};

export const MOTION_TEMPLATES: readonly MotionTemplate[] = [
  { id: 'product-launch', name: 'Product launch hero', category: 'Product', description: 'A polished product reveal with a camera push and title entrance.', duration: 6, width: 1920, height: 1080 },
  { id: 'feature-spotlight', name: 'Feature spotlight', category: 'Product', description: 'A device close-up with a headline and supporting feature copy.', duration: 8, width: 1920, height: 1080 },
  { id: 'app-store-preview', name: 'App Store preview', category: 'Social', description: 'A vertical phone composition ready for your app screens.', duration: 15, width: 1080, height: 1920 },
  { id: 'social-loop', name: 'Social loop', category: 'Social', description: 'A short square product loop for social posts.', duration: 4, width: 1080, height: 1080 },
  { id: 'model-reveal', name: 'Model reveal', category: 'Product', description: 'A wider product-stage composition with dramatic framing.', duration: 6, width: 1920, height: 1080 },
  { id: 'logo-sting', name: 'Logo sting', category: 'Brand', description: 'A minimal animated brand title on a clean stage.', duration: 4, width: 1920, height: 1080 },
  { id: 'software-launch', name: 'Software launch', category: 'Product', description: 'A browser window, live code card and feature callout for a software launch.', duration: 8, width: 1920, height: 1080 },
  { id: 'merch-drop', name: 'Merch drop', category: 'Product', description: 'A pedestal lineup of a mug, bottle and packaging box on a gradient stage.', duration: 6, width: 1920, height: 1080 },
  { id: 'merch-flatlay', name: 'Merch flat-lay', category: 'Social', description: 'A square apparel flat-lay with packaging and a print-ready chest area.', duration: 5, width: 1080, height: 1080 },
];

function syncScene(doc: MotionDocument): void {
  doc.scenes = doc.scenes.map((scene) => ({
    ...scene,
    nodes: doc.scene.nodes,
    cameraId: doc.scene.nodes.find((node) => node.type === 'camera.perspective')?.id ?? null,
    timeline: { ...doc.timeline, loop: undefined },
  }));
}

/** Build a fresh, editable document; no on-disk template is ever mutated. */
export function createMotionTemplate(templateId: string): MotionDocument {
  const template = MOTION_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Unknown Motion template "${templateId}".`);

  if (SHOWCASE_TEMPLATE_IDS.has(template.id)) return createShowcaseTemplate(template);

  const doc = createStarterMotionDocument();
  doc.meta.name = template.name;
  doc.meta.output = { width: template.width, height: template.height, fps: 30 };
  doc.timeline.duration = template.duration;
  doc.timeline.loop.end = template.duration;
  doc.timeline.workArea = { enabled: false, start: 0, end: template.duration };
  const clipTimeScale = new Map<string, number>();
  doc.timeline.clips = doc.timeline.clips.map((clip) => {
    const duration = Math.min(clip.duration, template.duration);
    const timeScale = duration / clip.duration;
    clipTimeScale.set(clip.id, timeScale);
    return {
      ...clip,
      duration,
      channels: clip.channels.map((channel) => ({
        ...channel,
        keyframes: channel.keyframes.map((keyframe) => ({
          ...keyframe,
          time: keyframe.time * timeScale,
        })),
      })),
    };
  });
  doc.timeline.tracks = doc.timeline.tracks.map((track) => ({
    ...track,
    placements: track.placements.map((placement) => {
      const clip = doc.timeline.clips.find((candidate) => candidate.id === placement.clipId);
      const duration = placement.duration ?? clip?.duration ?? template.duration;
      const timeScale = clipTimeScale.get(placement.clipId) ?? 1;
      return { ...placement, duration: Math.min(duration * timeScale, template.duration) };
    }),
  }));
  const title = doc.scene.nodes.find((node) => node.id === 'title');
  if (title) title.props.text = template.name;

  if (templateId === 'feature-spotlight') {
    doc.scene.nodes.push(createMotionNode('text.body', 'feature_copy', { name: 'Feature copy' }));
    const copy = doc.scene.nodes.find((node) => node.id === 'feature_copy');
    if (copy) copy.transform.position = [0, -0.7, 0];
  } else if (templateId === 'app-store-preview') {
    const productIndex = doc.scene.nodes.findIndex((node) => node.id === 'product');
    if (productIndex >= 0) {
      const phone = createMotionNode('device.phone', 'product', { name: 'Phone' });
      doc.scene.nodes[productIndex] = phone;
    }
    const screen = doc.scene.nodes.find((node) => node.id === 'screen_dashboard');
    if (screen) {
      screen.props.width = 1.07;
      screen.props.height = 2.37;
      screen.transform.position = [0, 0, 0.066];
    }
  } else if (templateId === 'model-reveal') {
    const productIndex = doc.scene.nodes.findIndex((node) => node.id === 'product');
    if (productIndex >= 0) {
      const model = createMotionNode('model.gltf', 'product', { name: '3D model — import from Local Library' });
      model.props.assetId = 'local:khronos/CesiumMan';
      model.props.missingAsset = true;
      model.transform.scale = [1.05, 1.05, 1.05];
      doc.scene.nodes[productIndex] = model;
    }
    doc.scene.nodes = doc.scene.nodes.filter((node) => node.id !== 'screen_dashboard');
  } else if (templateId === 'logo-sting') {
    doc.scene.nodes = doc.scene.nodes.filter((node) => !['product', 'screen_dashboard', 'light_point'].includes(node.id));
    if (title) {
      title.name = 'Brand title';
      title.props.text = 'Your brand';
      title.transform.scale = [1.25, 1.25, 1.25];
    }
    doc.timeline.tracks = doc.timeline.tracks.filter((track) => track.targetId !== 'product');
    doc.timeline.clips = doc.timeline.clips.filter((clip) => clip.id !== 'clip_product_spin');
  }

  syncScene(doc);
  return doc;
}

// ── Showcase scenes ──────────────────────────────────────────────────────────

const SHOWCASE_TEMPLATE_IDS = new Set(['software-launch', 'merch-drop', 'merch-flatlay']);
const LINEAR = EASING_PRESETS.linear.value;
const EASE_OUT = EASING_PRESETS.easeOut.value;
const EASE_IN_OUT = EASING_PRESETS.easeInOut.value;

function showcaseClip(
  id: string,
  name: string,
  duration: number,
  targetId: string,
  channels: Array<{
    property: string;
    keys: Array<{ time: number; value: number; easing?: MotionEasing }>;
  }>,
): MotionClip {
  return {
    id,
    name,
    duration,
    channels: channels.map((channel, channelIndex) => ({
      id: `chn_${id}_${channelIndex}`,
      targetId,
      property: channel.property,
      keyframes: channel.keys.map((key, index) => ({
        id: `kf_${id}_${channelIndex}_${index}`,
        time: key.time,
        value: key.value,
        easing: key.easing ?? EASE_IN_OUT,
      })),
    })),
  };
}

function showcaseTimeline(duration: number, clips: MotionClip[]): MotionTimeline {
  return {
    duration,
    loop: { enabled: true, start: 0, end: duration },
    workArea: { enabled: false, start: 0, end: duration },
    playMode: 'loop',
    tracks: clips.map((clip) => ({
      id: `trk_${clip.id.slice(5)}`,
      name: clip.name,
      targetId: clip.channels[0]?.targetId ?? null,
      muted: false,
      locked: false,
      placements: [{
        id: `plc_${clip.id.slice(5)}`,
        clipId: clip.id,
        start: 0,
        trimIn: 0,
        duration: clip.duration,
      }],
    })),
    clips,
    audio: [],
  };
}

/**
 * Builds the showcase scenes from the node library rather than by mutating the
 * starter document. Each scene owns literal ids so tests and agent recipes can
 * address `browser`, `callout`, `mug`, … without a lookup.
 */
function createShowcaseTemplate(template: MotionTemplate): MotionDocument {
  const doc = createEmptyMotionDocument({
    id: `doc_${template.id}`,
    name: template.name,
    duration: template.duration,
    width: template.width,
    height: template.height,
  });
  const nodes: MotionNode[] = [];
  const add = (node: MotionNode): MotionNode => {
    nodes.push(node);
    return node;
  };

  add(createMotionNode('light.ambient', 'light_ambient'));
  const keyLight = add(createMotionNode('light.directional', 'light_key'));
  keyLight.transform.position = [-3.5, 5, 4];
  add(createMotionNode('light.point', 'light_accent'));

  let clips: MotionClip[] = [];

  if (template.id === 'software-launch') {
    doc.assets = [{
      id: 'builtin:starter-dashboard',
      name: 'Starter dashboard',
      kind: 'image',
      mimeType: 'image/svg+xml',
      path: 'builtin/starter-dashboard',
      hash: 'builtin',
      byteSize: 0,
      frameCount: 1,
      fps: 30,
      createdAt: new Date().toISOString(),
      metadata: { builtin: true },
    }];

    const camera = add(createMotionNode('camera.perspective', 'camera'));
    camera.props.fov = 32;
    camera.transform.position = [0, 0.15, 8.6];

    const backdrop = add(createMotionNode('stage.backdrop', 'backdrop'));
    backdrop.props = { ...backdrop.props, width: 30, height: 16, topColor: '#1a2340', bottomColor: '#070a12' };
    backdrop.transform.position = [0, 0.5, -3.5];

    const browser = add(createMotionNode('ui.browser', 'browser', { name: 'Studio browser' }));
    browser.props.label = 'Qeda Studio — Overview';
    browser.props.url = 'qeda.app/studio/overview';
    browser.transform.position = [0, 0.35, 0];

    const screen = add(createMotionNode('screen.image', 'browser_screen', {
      name: 'Dashboard screen',
      parentId: 'browser',
    }));
    screen.props.width = 4.24;
    screen.props.height = 2.1;
    screen.transform.position = [0, -0.11, 0.08];

    const code = add(createMotionNode('ui.code', 'code_card', { name: 'Hero code' }));
    code.props.code = [
      'import { Stage, useMotion } from "@qeda/motion";',
      '',
      'export function Launch() {',
      '  const { frame, scrub } = useMotion();',
      '  return <Stage frame={frame} onScrub={scrub} />;',
      '}',
    ].join('\n');
    code.transform.position = [-2.7, -1.35, 0.9];
    code.transform.rotation = [0.05, 0.36, -0.02];

    const callout = add(createMotionNode('ui.annotation', 'callout', { name: 'Feature callout' }));
    callout.props.title = 'Live preview';
    callout.props.body = 'Scrub the timeline. Every frame is export-exact.';
    callout.transform.position = [2.7, 1.15, 1.0];
    callout.transform.rotation = [0, -0.3, 0];

    const title = add(createMotionNode('text.title', 'title', { name: 'Headline' }));
    title.props.text = 'Design in motion';
    title.props.fontSize = 0.28;
    title.props.maxWidth = 8;
    title.transform.position = [0, -1.95, 0.8];

    const body = add(createMotionNode('text.body', 'subhead', { name: 'Subhead' }));
    body.props.text = 'A product story, rendered frame by frame.';
    body.props.fontSize = 0.11;
    body.props.color = '#9fb0c9';
    body.transform.position = [0, -2.22, 0.8];

    clips = [
      showcaseClip('clip_software_push', 'Camera push', 8, 'camera', [
        { property: 'position.z', keys: [{ time: 0, value: 8.6, easing: EASE_OUT }, { time: 7, value: 7.5, easing: LINEAR }] },
        { property: 'rotation.y', keys: [{ time: 0, value: 0 }, { time: 7, value: -0.025 }] },
      ]),
      showcaseClip('clip_browser_rise', 'Browser rise', 8, 'browser', [
        { property: 'position.y', keys: [{ time: 0, value: 0.28, easing: EASE_OUT }, { time: 1.4, value: 0.35, easing: LINEAR }] },
      ]),
      showcaseClip('clip_title_in', 'Title in', 8, 'title', [
        { property: 'opacity', keys: [{ time: 0.3, value: 0, easing: EASE_OUT }, { time: 1.2, value: 1, easing: LINEAR }] },
        { property: 'position.y', keys: [{ time: 0.3, value: -2.12, easing: EASE_OUT }, { time: 1.2, value: -1.95, easing: LINEAR }] },
      ]),
      showcaseClip('clip_code_in', 'Code card in', 8, 'code_card', [
        { property: 'opacity', keys: [{ time: 0.4, value: 0, easing: EASE_OUT }, { time: 1.1, value: 1, easing: LINEAR }] },
      ]),
      showcaseClip('clip_callout_in', 'Callout in', 8, 'callout', [
        { property: 'opacity', keys: [{ time: 0.9, value: 0, easing: EASE_OUT }, { time: 1.7, value: 1, easing: LINEAR }] },
      ]),
    ];
  } else if (template.id === 'merch-drop') {
    const camera = add(createMotionNode('camera.perspective', 'camera'));
    camera.props.fov = 32;
    camera.transform.position = [0, 0.3, 7.5];

    const backdrop = add(createMotionNode('stage.backdrop', 'backdrop'));
    backdrop.props = { ...backdrop.props, width: 30, height: 16, topColor: '#243049', bottomColor: '#06080d' };
    backdrop.transform.position = [0, 0.4, -3.5];

    const pedestal = add(createMotionNode('stage.pedestal', 'pedestal'));
    pedestal.transform.position = [0, -0.75, 0];

    const mug = add(createMotionNode('product.mug', 'mug', { name: 'Mug' }));
    mug.transform.position = [-0.68, -0.275, 0.15];

    const bottle = add(createMotionNode('product.bottle', 'bottle', { name: 'Bottle' }));
    bottle.transform.position = [0.35, 0.1, -0.05];

    const box = add(createMotionNode('product.box', 'merch_box', { name: 'Packaging box' }));
    box.props.width = 0.62;
    box.props.height = 0.86;
    box.props.depth = 0.52;
    box.transform.position = [1.02, -0.32, -0.35];

    const title = add(createMotionNode('text.title', 'title', { name: 'Headline' }));
    title.props.text = 'The drop';
    title.props.fontSize = 0.26;
    title.transform.position = [0, -1.5, 0.8];

    const body = add(createMotionNode('text.body', 'subhead', { name: 'Subhead' }));
    body.props.text = 'Everyday objects, considered.';
    body.props.fontSize = 0.105;
    body.props.color = '#a6b3c7';
    body.transform.position = [0, -1.76, 0.8];

    clips = [
      showcaseClip('clip_camera_push', 'Camera push', 6, 'camera', [
        { property: 'position.z', keys: [{ time: 0, value: 7.5, easing: EASE_OUT }, { time: 5.5, value: 7.1, easing: LINEAR }] },
      ]),
      showcaseClip('clip_mug_spin', 'Mug spin', 6, 'mug', [
        { property: 'rotation.y', keys: [{ time: 0, value: 0, easing: EASE_IN_OUT }, { time: 5.5, value: Math.PI * 2, easing: LINEAR }] },
      ]),
      showcaseClip('clip_bottle_turn', 'Bottle turn', 6, 'bottle', [
        { property: 'rotation.y', keys: [{ time: 0, value: -0.3, easing: EASE_IN_OUT }, { time: 4.5, value: 0.45, easing: LINEAR }] },
      ]),
      showcaseClip('clip_box_turn', 'Box turn', 6, 'merch_box', [
        { property: 'rotation.y', keys: [{ time: 0, value: 0.22, easing: EASE_IN_OUT }, { time: 4.5, value: -0.2, easing: LINEAR }] },
      ]),
      showcaseClip('clip_title_in', 'Title in', 6, 'title', [
        { property: 'opacity', keys: [{ time: 0.4, value: 0, easing: EASE_OUT }, { time: 1.3, value: 1, easing: LINEAR }] },
        { property: 'position.y', keys: [{ time: 0.4, value: -1.66, easing: EASE_OUT }, { time: 1.3, value: -1.5, easing: LINEAR }] },
      ]),
    ];
  } else {
    const camera = add(createMotionNode('camera.perspective', 'camera'));
    camera.props.fov = 32;
    camera.transform.position = [0, 0, 6.8];

    const backdrop = add(createMotionNode('stage.backdrop', 'backdrop'));
    backdrop.props = { ...backdrop.props, width: 14, height: 14, topColor: '#efe9df', bottomColor: '#c9bfae' };
    backdrop.transform.position = [0, 0, -2];

    const apparel = add(createMotionNode('product.apparel', 'apparel', { name: 'T-shirt' }));
    apparel.props.width = 2.2;
    apparel.props.height = 2.55;
    apparel.transform.position = [-0.15, 0.2, 0];

    const box = add(createMotionNode('product.box', 'merch_box', { name: 'Packaging box' }));
    box.props.width = 0.55;
    box.props.height = 0.65;
    box.props.depth = 0.45;
    box.transform.position = [1.05, -0.55, 0.25];
    box.transform.rotation = [0, -0.35, 0.04];

    const title = add(createMotionNode('text.title', 'title', { name: 'Headline' }));
    title.props.text = 'The everyday edit';
    title.props.fontSize = 0.17;
    title.props.color = '#151b26';
    title.transform.position = [0, -1.45, 0.4];

    const body = add(createMotionNode('text.body', 'subhead', { name: 'Subhead' }));
    body.props.text = 'Soft cotton. Printed to order.';
    body.props.fontSize = 0.08;
    body.props.color = '#46505f';
    body.transform.position = [0, -1.66, 0.4];

    clips = [
      showcaseClip('clip_camera_push', 'Camera push', 5, 'camera', [
        { property: 'position.z', keys: [{ time: 0, value: 6.8, easing: EASE_OUT }, { time: 4.5, value: 6.5, easing: LINEAR }] },
      ]),
      showcaseClip('clip_apparel_float', 'Apparel float', 5, 'apparel', [
        { property: 'position.y', keys: [{ time: 0, value: 0.2, easing: EASE_IN_OUT }, { time: 2.4, value: 0.27, easing: EASE_IN_OUT }, { time: 5, value: 0.2, easing: LINEAR }] },
        { property: 'rotation.z', keys: [{ time: 0, value: 0, easing: EASE_IN_OUT }, { time: 5, value: 0.015, easing: LINEAR }] },
      ]),
      showcaseClip('clip_title_in', 'Title in', 5, 'title', [
        { property: 'opacity', keys: [{ time: 0.3, value: 0, easing: EASE_OUT }, { time: 1.1, value: 1, easing: LINEAR }] },
      ]),
    ];
  }

  doc.scene.nodes = nodes;
  doc.timeline = showcaseTimeline(template.duration, clips);
  doc.scenes = [{
    id: 'scene_main',
    name: 'Scene 1',
    nodes,
    timeline: { ...doc.timeline, loop: undefined },
    cameraId: 'camera',
  }];
  doc.activeSceneId = 'scene_main';
  return doc;
}
