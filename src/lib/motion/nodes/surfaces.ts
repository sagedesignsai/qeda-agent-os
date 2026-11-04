/**
 * lib/motion/nodes/surfaces.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Media surfaces. `assetId` is the field everything reads and writes, including
 * the defaults; `source` stays in the image schema only so a pre-v4 in-memory
 * document still validates.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const fitHint: MotionPropertyHint = {
  label: 'Fit',
  control: 'segmented',
  group: 'Content',
  options: [
    { value: 'contain', label: 'Fit inside' },
    { value: 'cover', label: 'Fill frame' },
    { value: 'stretch', label: 'Stretch' },
  ],
};

export const screenImage: MotionNodeTypeDefinition = {
  id: 'screen.image',
  label: 'Image screen',
  category: 'surface',
  description: 'A flat image surface mounted on a device or placed in the scene.',
  propsSchema: z
    .object({
      source: z.string().min(1).optional(),
      assetId: z.string().min(1).optional(),
      missingAsset: z.boolean().optional(),
      width: z.number().positive(),
      height: z.number().positive(),
      fit: z.enum(['contain', 'cover', 'stretch']),
      tint: z.string().min(1).default('#ffffff'),
      opacity: z.number().min(0).max(1),
    })
    .refine(
      (props) => Boolean(props.source || props.assetId || props.missingAsset),
      'An image asset reference is required.',
    ),
  defaultProps: {
    assetId: 'builtin:starter-dashboard',
    width: 3.46,
    height: 1.947,
    fit: 'contain',
    tint: '#ffffff',
    opacity: 1,
  },
  defaultTransform: { position: [0, 0, 0.118] },
  animatableProperties: { opacity: { description: 'Surface opacity from 0 to 1.' } },
  defaultName: 'Screen',
  allowedParents: [
    'device.tablet',
    'device.phone',
    'device.laptop',
    'device.monitor',
    'ui.browser',
    'scene.group',
  ],
  propertyHints: {
    assetId: { label: 'Image', control: 'asset', assetKind: 'image', group: 'Content' },
    width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    fit: fitHint,
    tint: { label: 'Tint', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const screenVideo: MotionNodeTypeDefinition = {
  id: 'screen.video',
  label: 'Video screen',
  category: 'surface',
  description: 'A video surface mounted in the scene.',
  propsSchema: z.object({
    assetId: z.string().min(1),
    missingAsset: z.boolean().optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    fit: z.enum(['contain', 'cover', 'stretch']),
    opacity: z.number().min(0).max(1),
    muted: z.boolean(),
    loop: z.boolean(),
    playbackRate: z.number().positive(),
  }),
  defaultProps: {
    assetId: 'missing:video',
    missingAsset: true,
    width: 3.46,
    height: 1.947,
    fit: 'contain',
    opacity: 1,
    muted: true,
    loop: true,
    playbackRate: 1,
  },
  defaultTransform: { position: [0, 0, 0.118] },
  animatableProperties: { opacity: { description: 'Video surface opacity.' } },
  defaultName: 'Video screen',
  propertyHints: {
    assetId: { label: 'Video', control: 'asset', assetKind: 'video', group: 'Content' },
    width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    fit: fitHint,
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
    muted: { label: 'Muted', control: 'toggle', group: 'Playback' },
    loop: { label: 'Loop', control: 'toggle', group: 'Playback' },
    playbackRate: { label: 'Playback rate', control: 'number', min: 0.1, max: 4, step: 0.1, group: 'Playback' },
  },
};
