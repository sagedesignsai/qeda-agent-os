/**
 * lib/motion/nodes/text.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Text primitives. Title and body intentionally share one prop shape so a single
 * renderer serves both; they differ only in defaults (size, alignment, width).
 *
 * `letterSpacing`/`lineHeight` are not animatable: `applyMotionFrame` applies
 * text size and opacity per frame, and these are React-rendered props, so a
 * channel on them would evaluate without being drawn.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const typographyShape = {
  color: z.string().min(1).default('#ffffff'),
  fontSize: z.number().positive(),
  opacity: z.number().min(0).max(1),
  letterSpacing: z.number().default(0),
  lineHeight: z.number().positive().default(1),
  fontAssetId: z.string().min(1).optional(),
  maxWidth: z.number().positive(),
  align: z.enum(['left', 'center', 'right']),
};

const textHints: Record<string, MotionPropertyHint> = {
  text: { label: 'Text', control: 'text', group: 'Content' },
  fontAssetId: { label: 'Font', control: 'asset', assetKind: 'font', group: 'Typography', optional: true },
  fontSize: { label: 'Font size', control: 'number', min: 0.01, step: 0.01, group: 'Typography' },
  letterSpacing: { label: 'Letter spacing', control: 'number', step: 0.01, group: 'Typography' },
  lineHeight: { label: 'Line height', control: 'number', min: 0.1, step: 0.05, group: 'Typography' },
  align: {
    label: 'Alignment',
    control: 'segmented',
    group: 'Typography',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ],
  },
  maxWidth: { label: 'Max width', control: 'number', min: 0.1, step: 0.1, group: 'Layout' },
  color: { label: 'Color', control: 'color', group: 'Appearance' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
};

const animatableProperties = {
  opacity: { description: 'Text opacity from 0 to 1.' },
  fontSize: { description: 'Text size in scene units.' },
};

export const textTitle: MotionNodeTypeDefinition = {
  id: 'text.title',
  label: 'Title',
  category: 'surface',
  description: 'A brand title rendered as a camera-facing scene element.',
  propsSchema: z.object({ text: z.string(), ...typographyShape }),
  defaultProps: {
    text: 'Product title',
    color: '#ffffff',
    fontSize: 0.3,
    opacity: 1,
    letterSpacing: 0,
    lineHeight: 1,
    maxWidth: 12,
    align: 'center',
  },
  defaultTransform: { position: [0, -1.7, 0] },
  animatableProperties,
  defaultName: 'Title',
  propertyHints: textHints,
};

export const textBody: MotionNodeTypeDefinition = {
  id: 'text.body',
  label: 'Body text',
  category: 'surface',
  description: 'Supporting copy rendered as a camera-facing text surface.',
  propsSchema: z.object({ text: z.string(), ...typographyShape }),
  defaultProps: {
    text: 'Supporting copy',
    color: '#ffffff',
    fontSize: 0.16,
    opacity: 1,
    letterSpacing: 0,
    lineHeight: 1,
    maxWidth: 4,
    align: 'left',
  },
  animatableProperties,
  defaultName: 'Body text',
  propertyHints: textHints,
};

export const textCaption: MotionNodeTypeDefinition = {
  id: 'text.caption',
  label: 'Caption',
  category: 'surface',
  description: 'A subtitle bar with an optional background plate.',
  propsSchema: z.object({ text: z.string(), ...typographyShape, background: z.string().min(1).optional(), paddingX: z.number().nonnegative(), paddingY: z.number().nonnegative(), cornerRadius: z.number().nonnegative() }),
  defaultProps: {
    text: 'Caption text',
    color: '#ffffff',
    fontSize: 0.14,
    opacity: 1,
    letterSpacing: 0,
    lineHeight: 1,
    maxWidth: 8,
    align: 'center',
    background: '#0e131c',
    paddingX: 0.18,
    paddingY: 0.08,
    cornerRadius: 0.06,
  },
  animatableProperties,
  defaultName: 'Caption',
  propertyHints: {
    ...textHints,
    background: { label: 'Background', control: 'color', group: 'Appearance', optional: true },
    paddingX: { label: 'Horizontal padding', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    paddingY: { label: 'Vertical padding', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    cornerRadius: { label: 'Corner radius', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
  },
};

export const textQuote: MotionNodeTypeDefinition = {
  id: 'text.quote',
  label: 'Quote',
  category: 'surface',
  description: 'A pull quote with attribution.',
  propsSchema: z.object({ text: z.string(), attribution: z.string().optional(), ...typographyShape, quoteColor: z.string().min(1), attributionColor: z.string().min(1) }),
  defaultProps: {
    text: '“Design is how it works.”',
    attribution: '— Steve Jobs',
    color: '#ffffff',
    quoteColor: '#ffffff',
    attributionColor: '#9fb0c9',
    fontSize: 0.22,
    opacity: 1,
    letterSpacing: 0,
    lineHeight: 1.2,
    maxWidth: 10,
    align: 'center',
  },
  animatableProperties,
  defaultName: 'Quote',
  propertyHints: {
    ...textHints,
    attribution: { label: 'Attribution', control: 'text', group: 'Content', optional: true },
    quoteColor: { label: 'Quote color', control: 'color', group: 'Appearance' },
    attributionColor: { label: 'Attribution color', control: 'color', group: 'Appearance' },
  },
};
