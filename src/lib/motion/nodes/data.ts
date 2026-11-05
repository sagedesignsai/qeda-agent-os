/**
 * lib/motion/nodes/data.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Data-viz nodes. Static layout comes from `chart-layout.ts`; `progress` and
 * `value` are animated through the animated-prop applier registry.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';
import { NUMBER_GLYPHS } from './graphics';

const colorHint = { control: 'color' as const, group: 'Appearance' as const };
const opacityHint = { control: 'slider' as const, min: 0, max: 1, step: 0.01, group: 'Appearance' as const };

export const dataKpi: MotionNodeTypeDefinition = {
  id: 'data.kpi',
  label: 'KPI',
  category: 'data',
  description: 'A big number with label and delta.',
  propsSchema: z.object({
    value: z.number(),
    label: z.string(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    delta: z.number().optional(),
    deltaLabel: z.string().optional(),
    valueSize: z.number().positive(),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { value: 12840, label: 'Monthly active users', prefix: '', suffix: '', delta: 0.12, deltaLabel: '+12% vs last month', valueSize: 0.5, color: '#ffffff', accentColor: '#59c7a6', opacity: 1 },
  animatableProperties: { opacity: { description: 'KPI opacity.' }, value: { description: 'Animated value.' } },
  defaultName: 'KPI',
  propertyHints: {
    value: { label: 'Value', control: 'number', step: 1, group: 'Content' },
    label: { label: 'Label', control: 'text', group: 'Content' },
    prefix: { label: 'Prefix', control: 'text', group: 'Content', optional: true },
    suffix: { label: 'Suffix', control: 'text', group: 'Content', optional: true },
    delta: { label: 'Delta', control: 'number', step: 0.01, group: 'Content' },
    deltaLabel: { label: 'Delta label', control: 'text', group: 'Content', optional: true },
    valueSize: { label: 'Value size', control: 'number', min: 0.1, step: 0.05, group: 'Typography' },
    color: { label: 'Value color', control: 'color', group: 'Appearance' },
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const dataProgressBar: MotionNodeTypeDefinition = {
  id: 'data.progress-bar',
  label: 'Progress bar',
  category: 'data',
  description: 'A horizontal progress bar.',
  propsSchema: z.object({
    progress: z.number().min(0).max(1),
    label: z.string().optional(),
    valueLabel: z.string().optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    color: z.string().min(1),
    trackColor: z.string().min(1),
    cornerRadius: z.number().nonnegative(),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { progress: 0.64, label: 'Completion', valueLabel: '64%', width: 3.2, height: 0.18, color: '#5885f7', trackColor: '#1b2230', cornerRadius: 0.09, opacity: 1 },
  animatableProperties: { opacity: { description: 'Bar opacity.' }, progress: { description: 'Progress from 0 to 1.' } },
  defaultName: 'Progress bar',
  propertyHints: {
    progress: { label: 'Progress', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Content' },
    label: { label: 'Label', control: 'text', group: 'Content', optional: true },
    valueLabel: { label: 'Value label', control: 'text', group: 'Content', optional: true },
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    color: { label: 'Progress color', ...colorHint },
    trackColor: { label: 'Track color', control: 'color', group: 'Appearance' },
    cornerRadius: { label: 'Corner radius', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const dataBarChart: MotionNodeTypeDefinition = {
  id: 'data.bar-chart',
  label: 'Bar chart',
  category: 'data',
  description: 'A vertical bar chart.',
  propsSchema: z.object({
    values: z.array(z.number()).min(1).max(40),
    labels: z.array(z.string()).max(40).optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    gap: z.number().nonnegative(),
    color: z.string().min(1),
    highlightColor: z.string().min(1).optional(),
    progress: z.number().min(0).max(1),
    showValues: z.boolean(),
    axisColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { values: [4, 7, 5, 9, 6, 8], labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], width: 4, height: 2, gap: 0.15, color: '#5885f7', highlightColor: '#59c7a6', progress: 1, showValues: true, axisColor: '#2a3344', opacity: 1 },
  animatableProperties: { opacity: { description: 'Chart opacity.' }, progress: { description: 'Reveal progress.' } },
  defaultName: 'Bar chart',
  propertyHints: {
    values: { label: 'Values', control: 'textarea', group: 'Content' },
    labels: { label: 'Labels', control: 'textarea', group: 'Content', optional: true },
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    gap: { label: 'Gap', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    color: { label: 'Bar color', ...colorHint },
    highlightColor: { label: 'Highlight color', control: 'color', group: 'Appearance', optional: true },
    progress: { label: 'Reveal', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Content' },
    showValues: { label: 'Show values', control: 'toggle', group: 'Content' },
    axisColor: { label: 'Axis color', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const dataLineChart: MotionNodeTypeDefinition = {
  id: 'data.line-chart',
  label: 'Line chart',
  category: 'data',
  description: 'A line/area chart.',
  propsSchema: z.object({
    values: z.array(z.number()).min(2).max(64),
    width: z.number().positive(),
    height: z.number().positive(),
    lineWidth: z.number().positive(),
    color: z.string().min(1),
    fill: z.boolean(),
    fillOpacity: z.number().min(0).max(1),
    showGrid: z.boolean(),
    gridColor: z.string().min(1),
    progress: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { values: [3, 5, 4, 7, 6, 9, 8, 10], width: 4, height: 1.8, lineWidth: 0.04, color: '#5885f7', fill: true, fillOpacity: 0.18, showGrid: true, gridColor: '#1b2230', progress: 1, opacity: 1 },
  animatableProperties: { opacity: { description: 'Chart opacity.' }, progress: { description: 'Reveal progress.' } },
  defaultName: 'Line chart',
  propertyHints: {
    values: { label: 'Values', control: 'textarea', group: 'Content' },
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.3, step: 0.1, group: 'Dimensions' },
    lineWidth: { label: 'Line width', control: 'number', min: 0.01, step: 0.005, group: 'Dimensions' },
    color: { label: 'Line color', ...colorHint },
    fill: { label: 'Fill', control: 'toggle', group: 'Appearance' },
    fillOpacity: { label: 'Fill opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
    showGrid: { label: 'Show grid', control: 'toggle', group: 'Appearance' },
    gridColor: { label: 'Grid color', control: 'color', group: 'Appearance' },
    progress: { label: 'Reveal', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Content' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const dataDonutChart: MotionNodeTypeDefinition = {
  id: 'data.donut-chart',
  label: 'Donut chart',
  category: 'data',
  description: 'A donut chart with segments.',
  propsSchema: z.object({
    segments: z.array(z.object({ value: z.number().positive(), color: z.string().min(1), label: z.string().optional() })).min(1).max(12),
    radius: z.number().positive(),
    thickness: z.number().positive(),
    centerLabel: z.string().optional(),
    centerValue: z.string().optional(),
    gap: z.number().nonnegative(),
    progress: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { segments: [{ value: 42, color: '#5885f7', label: 'A' }, { value: 28, color: '#59c7a6', label: 'B' }, { value: 30, color: '#a88cf7', label: 'C' }], radius: 1, thickness: 0.22, centerLabel: 'Total', centerValue: '100', gap: 0.02, progress: 1, opacity: 1 },
  animatableProperties: { opacity: { description: 'Chart opacity.' }, progress: { description: 'Reveal progress.' } },
  defaultName: 'Donut chart',
  propertyHints: {
    segments: { label: 'Segments', control: 'textarea', group: 'Content' },
    radius: { label: 'Radius', control: 'number', min: 0.2, step: 0.05, group: 'Dimensions' },
    thickness: { label: 'Thickness', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    centerLabel: { label: 'Center label', control: 'text', group: 'Content', optional: true },
    centerValue: { label: 'Center value', control: 'text', group: 'Content', optional: true },
    gap: { label: 'Gap (rad)', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    progress: { label: 'Reveal', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Content' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const dataStatGrid: MotionNodeTypeDefinition = {
  id: 'data.stat-grid',
  label: 'Stat grid',
  category: 'data',
  description: 'A 2–4 cell stat grid.',
  propsSchema: z.object({
    items: z.array(z.object({ value: z.string(), label: z.string(), delta: z.string().optional() })).min(2).max(4),
    columns: z.number().int().min(1).max(4),
    width: z.number().positive(),
    height: z.number().positive(),
    cardColor: z.string().min(1),
    valueColor: z.string().min(1),
    labelColor: z.string().min(1),
    gap: z.number().nonnegative(),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { items: [{ value: '12.4k', label: 'Users', delta: '+8%' }, { value: '99.9%', label: 'Uptime', delta: '+0.1%' }, { value: '3.2s', label: 'Load time', delta: '-0.4s' }, { value: '4.8★', label: 'Rating', delta: '+0.2' }], columns: 2, width: 4, height: 2, cardColor: '#111823', valueColor: '#ffffff', labelColor: '#9fb0c9', gap: 0.12, opacity: 1 },
  animatableProperties: { opacity: { description: 'Grid opacity.' } },
  defaultName: 'Stat grid',
  propertyHints: {
    items: { label: 'Items', control: 'textarea', group: 'Content' },
    columns: { label: 'Columns', control: 'number', min: 1, max: 4, step: 1, group: 'Dimensions' },
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    cardColor: { label: 'Card color', control: 'color', group: 'Appearance' },
    valueColor: { label: 'Value color', control: 'color', group: 'Appearance' },
    labelColor: { label: 'Label color', control: 'color', group: 'Appearance' },
    gap: { label: 'Gap', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    opacity: { label: 'Opacity', ...opacityHint },
  },
};

export const dataNodes = [dataKpi, dataProgressBar, dataBarChart, dataLineChart, dataDonutChart, dataStatGrid];