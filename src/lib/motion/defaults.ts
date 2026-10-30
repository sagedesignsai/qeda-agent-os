/**
 * lib/motion/defaults.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document factories, including the starter composition the editor opens with.
 *
 * The starter document uses **stable, literal ids** (`trk_product`,
 * `kf_product_spin_1`, …) rather than generated ones. Agent transcripts and
 * tests can then reference a known composition without first querying the
 * document, and a fresh project is reproducible byte-for-byte.
 */

import { EASING_PRESETS } from './easing';
import { createMotionNode } from './node-registry';
import { MOTION_SCHEMA_VERSION, type MotionDocument, type MotionTimeline } from './types';

const linear = EASING_PRESETS.linear.value;
const easeOut = EASING_PRESETS.easeOut.value;
const easeInOut = EASING_PRESETS.easeInOut.value;
const smooth = EASING_PRESETS.smooth.value;

export type CreateDocumentOptions = {
  id?: string;
  name?: string;
  now?: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
};

export function createEmptyMotionDocument(options: CreateDocumentOptions = {}): MotionDocument {
  const now = options.now ?? new Date().toISOString();
  const duration = options.duration ?? 6;
  const timeline: MotionTimeline = {
    duration,
    loop: { enabled: true, start: 0, end: duration },
    tracks: [],
    clips: [],
  };
  return {
    schemaVersion: MOTION_SCHEMA_VERSION,
    assets: [],
    scene: { nodes: [] },
    meta: {
      id: options.id ?? 'doc_local',
      name: options.name ?? 'Untitled motion',
      createdAt: now,
      updatedAt: now,
      output: {
        fps: options.fps ?? 30,
        width: options.width ?? 1920,
        height: options.height ?? 1080,
      },
    },
    timeline,
  };
}

/**
 * The composition a new Motion project starts from: a product that spins, a
 * camera push, and a title fade — the Phase 1 demo in miniature, so the timeline
 * has real content on first paint instead of an empty grid.
 */
export function createStarterMotionDocument(now?: string): MotionDocument {
  const doc = createEmptyMotionDocument({ id: 'doc_starter', name: 'Launch hero', now });
  doc.scene.nodes = [
    createMotionNode('camera.perspective', 'camera'),
    createMotionNode('device.tablet', 'product', { name: 'Product' }),
    createMotionNode('screen.image', 'screen_dashboard', {
      name: 'Dashboard screen',
      parentId: 'product',
    }),
    createMotionNode('text.title', 'title', { name: 'Title' }),
    createMotionNode('light.ambient', 'light_ambient'),
    createMotionNode('light.directional', 'light_key'),
    createMotionNode('light.point', 'light_accent'),
  ];
  doc.timeline = {
    duration: 6,
    loop: { enabled: true, start: 0, end: 6 },
    tracks: [
      {
        id: 'trk_camera',
        name: 'Camera',
        targetId: 'camera',
        muted: false,
        locked: false,
        placements: [{ id: 'plc_camera', clipId: 'clip_camera_push', start: 0 }],
      },
      {
        id: 'trk_product',
        name: 'Product',
        targetId: 'product',
        muted: false,
        locked: false,
        placements: [{ id: 'plc_product', clipId: 'clip_product_spin', start: 0 }],
      },
      {
        id: 'trk_title',
        name: 'Title',
        targetId: 'title',
        muted: false,
        locked: false,
        placements: [{ id: 'plc_title', clipId: 'clip_title_in', start: 0 }],
      },
    ],
    clips: [
      {
        id: 'clip_camera_push',
        name: 'Camera push',
        duration: 5,
        channels: [
          {
            id: 'chn_camera_z',
            targetId: 'camera',
            property: 'position.z',
            keyframes: [
              { id: 'kf_camera_z_0', time: 0, value: 2.4, easing: easeOut },
              { id: 'kf_camera_z_1', time: 4.5, value: 1.55, easing: linear },
            ],
          },
          {
            id: 'chn_camera_tilt',
            targetId: 'camera',
            property: 'rotation.x',
            keyframes: [
              { id: 'kf_camera_tilt_0', time: 0, value: 0, easing: easeInOut },
              { id: 'kf_camera_tilt_1', time: 4.5, value: -0.05, easing: linear },
            ],
          },
        ],
      },
      {
        id: 'clip_product_spin',
        name: 'Product spin',
        duration: 5,
        channels: [
          {
            id: 'chn_product_spin',
            targetId: 'product',
            property: 'rotation.y',
            keyframes: [
              { id: 'kf_product_spin_0', time: 0, value: 0, easing: smooth },
              { id: 'kf_product_spin_1', time: 4.5, value: Math.PI * 2, easing: linear },
            ],
          },
          {
            id: 'chn_product_lift',
            targetId: 'product',
            property: 'position.y',
            keyframes: [
              { id: 'kf_product_lift_0', time: 0, value: 0, easing: easeInOut },
              { id: 'kf_product_lift_1', time: 1.4, value: 0.12, easing: easeInOut },
              { id: 'kf_product_lift_2', time: 4.5, value: 0, easing: linear },
            ],
          },
        ],
      },
      {
        id: 'clip_title_in',
        name: 'Title in',
        duration: 2.4,
        channels: [
          {
            id: 'chn_title_opacity',
            targetId: 'title',
            property: 'opacity',
            keyframes: [
              { id: 'kf_title_opacity_0', time: 0.6, value: 0, easing: easeOut },
              { id: 'kf_title_opacity_1', time: 1.3, value: 1, easing: linear },
            ],
          },
          {
            id: 'chn_title_lift',
            targetId: 'title',
            property: 'position.y',
            keyframes: [
              { id: 'kf_title_lift_0', time: 0.6, value: 0.4, easing: easeOut },
              { id: 'kf_title_lift_1', time: 1.4, value: 0, easing: linear },
            ],
          },
        ],
      },
    ],
  };
  return doc;
}
