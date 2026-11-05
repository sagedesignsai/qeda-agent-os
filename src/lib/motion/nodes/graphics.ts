/**
 * lib/motion/nodes/graphics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 2D broadcast/graphics primitives. These are camera-facing flat geometry plus
 * SDF text, so they export exactly as they appear in the viewport. Every
 * numeric animation beyond opacity requires an applier in `animated-props.ts`.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const NUMBER_GLYPHS = "0123456789.,%$€£+−kM×";

export { NUMBER_GLYPHS };

const colorHint = { control: 'color' as const, group: 'Appearance' as const };
const opacityHint = { control: 'slider' as const, min: 0, max: 1, step: 0.01, group: 'Appearance' as const };

export const graphicLine: MotionNodeTypeDefinition = {
  id: 'graphic.line',
  label: 'Line',
  category: 'graphics',
  description: 'A divider or connector rule.',
  propsSchema: z.object({
    length: z.number().positive(),
    thickness: z.number().positive(),
    color: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { length: 4, thickness: 0.02, color: '#ffffff', opacity: 1 },
  animatableProperties: { opacity: { description: 'Line opacity.' } },
  defaultName: 'Line',
  propertyHints: {
    length: { label: 'Length', control: 'number', min: 0.1, step: 0.1, group: 'Dimensions' },
    thickness: { label: 'Thickness', control: 'number', min: 0.001, step: 0.001, group: 'Dimensions' },
    color: { label: 'Color', ...colorHint },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const graphicArrow: MotionNodeTypeDefinition = {
  id: 'graphic.arrow',
  label: 'Arrow',
  category: 'graphics',
  description: 'A directional pointer for callouts and flows.',
  propsSchema: z.object({
    length: z.number().positive(),
    thickness: z.number().positive(),
    headSize: z.number().positive(),
    color: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { length: 1.6, thickness: 0.03, headSize: 0.18, color: '#ffffff', opacity: 1 },
  animatableProperties: { opacity: { description: 'Arrow opacity.' } },
  defaultName: 'Arrow',
  propertyHints: {
    length: { label: 'Length', control: 'number', min: 0.1, step: 0.1, group: 'Dimensions' },
    thickness: { label: 'Thickness', control: 'number', min: 0.001, step: 0.001, group: 'Dimensions' },
    headSize: { label: 'Head size', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    color: { label: 'Color', ...colorHint },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const graphicBadge: MotionNodeTypeDefinition = {
  id: 'graphic.badge',
  label: 'Badge',
  category: 'graphics',
  description: 'A pill-shaped label chip (NEW, version, price).',
  propsSchema: z.object({
    text: z.string(),
    fontSize: z.number().positive(),
    paddingX: z.number().nonnegative(),
    paddingY: z.number().nonnegative(),
    cornerRadius: z.number().nonnegative(),
    background: z.string().min(1),
    color: z.string().min(1),
    borderColor: z.string().min(1).optional(),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { text: 'NEW', fontSize: 0.16, paddingX: 0.16, paddingY: 0.07, cornerRadius: 0.2, background: '#5885f7', color: '#ffffff', borderColor: '#ffffff', opacity: 1 },
  animatableProperties: { opacity: { description: 'Badge opacity.' } },
  defaultName: 'Badge',
  propertyHints: {
    text: { label: 'Text', control: 'text', group: 'Content' },
    fontSize: { label: 'Font size', control: 'number', min: 0.05, step: 0.01, group: 'Typography' },
    paddingX: { label: 'Horizontal padding', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    paddingY: { label: 'Vertical padding', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    cornerRadius: { label: 'Corner radius', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Text color', control: 'color', group: 'Appearance' },
    borderColor: { label: 'Border color', control: 'color', group: 'Appearance', optional: true },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const graphicLowerThird: MotionNodeTypeDefinition = {
  id: 'graphic.lower-third',
  label: 'Lower third',
  category: 'graphics',
  description: 'A broadcast name/title bar.',
  propsSchema: z.object({
    name: z.string(),
    title: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    accentColor: z.string().min(1),
    background: z.string().min(1),
    color: z.string().min(1),
    titleColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { name: 'Jane Doe', title: 'Head of Product', width: 4.2, height: 0.9, accentColor: '#5885f7', background: '#0e131c', color: '#ffffff', titleColor: '#9fb0c9', opacity: 1 },
  animatableProperties: { opacity: { description: 'Lower third opacity.' } },
  defaultName: 'Lower third',
  propertyHints: {
    name: { label: 'Name', control: 'text', group: 'Content' },
    title: { label: 'Title', control: 'text', group: 'Content' },
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.2, step: 0.05, group: 'Dimensions' },
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Name color', control: 'color', group: 'Appearance' },
    titleColor: { label: 'Title color', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const graphicProgressRing: MotionNodeTypeDefinition = {
  id: 'graphic.progress-ring',
  label: 'Progress ring',
  category: 'graphics',
  description: 'A circular progress indicator.',
  propsSchema: z.object({
    progress: z.number().min(0).max(1),
    radius: z.number().positive(),
    thickness: z.number().positive(),
    color: z.string().min(1),
    trackColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { progress: 0.72, radius: 0.9, thickness: 0.12, color: '#5885f7', trackColor: '#1b2230', opacity: 1 },
  animatableProperties: { opacity: { description: 'Ring opacity.' }, progress: { description: 'Ring progress from 0 to 1.' } },
  defaultName: 'Progress ring',
  propertyHints: {
    progress: { label: 'Progress', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Content' },
    radius: { label: 'Radius', control: 'number', min: 0.1, step: 0.05, group: 'Dimensions' },
    thickness: { label: 'Thickness', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
    color: { label: 'Progress color', control: 'color', group: 'Appearance' },
    trackColor: { label: 'Track color', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const graphicWaveform: MotionNodeTypeDefinition = {
  id: 'graphic.waveform',
  label: 'Waveform',
  category: 'graphics',
  description: 'An audio waveform bar visualizer.',
  propsSchema: z.object({
    values: z.array(z.number()).min(2).max(128),
    bars: z.number().int().min(4).max(128),
    height: z.number().positive(),
    width: z.number().positive(),
    color: z.string().min(1),
    gap: z.number().nonnegative(),
    opacity: z.number().min(0).max(1),
    mirrored: z.boolean(),
  }),
  defaultProps: { values: Array.from({ length: 32 }, (_, i) => 0.3 + 0.4 * Math.abs(Math.sin(i * 0.6))), bars: 32, height: 0.9, width: 3.6, color: '#59c7a6', gap: 0.03, opacity: 1, mirrored: false },
  animatableProperties: { opacity: { description: 'Waveform opacity.' } },
  defaultName: 'Waveform',
  propertyHints: {
    values: { label: 'Values', control: 'textarea', group: 'Content' },
    bars: { label: 'Bars', control: 'number', min: 4, max: 128, step: 1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.1, group: 'Dimensions' },
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    color: { label: 'Color', ...colorHint },
    gap: { label: 'Gap', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    opacity: { label: 'Opacity', ...opacityHint },
    mirrored: { label: 'Mirrored', control: 'toggle', group: 'Appearance' },
  },
};

export const graphicTicker: MotionNodeTypeDefinition = {
  id: 'graphic.ticker',
  label: 'Ticker',
  category: 'graphics',
  description: 'A horizontal scrolling text band.',
  propsSchema: z.object({
    text: z.string(),
    fontSize: z.number().positive(),
    height: z.number().positive(),
    background: z.string().min(1),
    color: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { text: 'Breaking news · Qeda Studio launches today · ', fontSize: 0.18, height: 0.4, background: '#0e131c', color: '#ffffff', opacity: 1 },
  animatableProperties: { opacity: { description: 'Ticker opacity.' } },
  defaultName: 'Ticker',
  propertyHints: {
    text: { label: 'Text', control: 'textarea', group: 'Content' },
    fontSize: { label: 'Font size', control: 'number', min: 0.05, step: 0.01, group: 'Typography' },
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.05, group: 'Dimensions' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Text color', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const graphicNodes = [graphicLine, graphicArrow, graphicBadge, graphicLowerThird, graphicProgressRing, graphicWaveform, graphicTicker];