/**
 * lib/motion/templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Script-free Motion starter templates and factories. Template metadata is
 * serializable data; factory logic only clones and configures known node types.
 */

import { createStarterMotionDocument } from './defaults';
import { createMotionNode } from './node-registry';
import type { MotionDocument } from './types';

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

  const doc = createStarterMotionDocument();
  doc.meta.name = template.name;
  doc.meta.output = { width: template.width, height: template.height, fps: 30 };
  doc.timeline.duration = template.duration;
  doc.timeline.loop.end = template.duration;
  doc.timeline.workArea = { enabled: false, start: 0, end: template.duration };
  doc.timeline.clips = doc.timeline.clips.map((clip) => ({ ...clip, duration: Math.min(clip.duration, template.duration) }));
  doc.timeline.tracks = doc.timeline.tracks.map((track) => ({
    ...track,
    placements: track.placements.map((placement) => ({ ...placement, duration: Math.min(placement.duration ?? template.duration, template.duration) })),
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
  } else if (templateId === 'model-reveal') {
    const productIndex = doc.scene.nodes.findIndex((node) => node.id === 'product');
    if (productIndex >= 0) {
      const model = createMotionNode('model.gltf', 'product', { name: 'Replace me — 3D model' });
      model.props.assetId = 'missing:model-reveal';
      model.props.missingAsset = true;
      model.transform.scale = [1.05, 1.05, 1.05];
      doc.scene.nodes[productIndex] = model;
    }
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
