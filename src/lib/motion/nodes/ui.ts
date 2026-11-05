/**
 * lib/motion/nodes/ui.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Software-showcase primitives: a browser window that can host a `screen.*`
 * surface, a code card, and an annotation callout. They are UI-shaped but plain
 * scene nodes — nothing here depends on the app's own React UI, so the export
 * renderer draws exactly what the viewport draws.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const sharedHints: Record<string, MotionPropertyHint> = {
  width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
  height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
};

export const uiBrowser: MotionNodeTypeDefinition = {
  id: 'ui.browser',
  label: 'Browser window',
  category: 'ui',
  description: 'A browser chrome that frames a screen surface mounted inside it.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    cornerRadius: z.number().nonnegative(),
    chromeHeight: z.number().positive(),
    label: z.string(),
    url: z.string(),
    color: z.string().min(1),
    chromeColor: z.string().min(1),
    accentColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    width: 4.6,
    height: 2.75,
    depth: 0.12,
    cornerRadius: 0.09,
    chromeHeight: 0.34,
    label: 'Studio — Overview',
    url: 'qeda.app/studio',
    color: '#0e131c',
    chromeColor: '#1b2230',
    accentColor: '#5885f7',
    opacity: 1,
  },
  animatableProperties: { opacity: { description: 'Browser window opacity.' } },
  defaultName: 'Browser window',
  propertyHints: {
    label: { label: 'Tab title', control: 'text', group: 'Content' },
    url: { label: 'Address', control: 'text', group: 'Content' },
    ...sharedHints,
    depth: { label: 'Depth', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
    chromeHeight: { label: 'Chrome height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    cornerRadius: { label: 'Corner radius', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
    color: { label: 'Frame', control: 'color', group: 'Appearance' },
    chromeColor: { label: 'Chrome', control: 'color', group: 'Appearance' },
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
  },
};

export const uiCode: MotionNodeTypeDefinition = {
  id: 'ui.code',
  label: 'Code card',
  category: 'ui',
  description: 'A syntax-card with an editor title bar, gutter and monospace code.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    title: z.string(),
    language: z.string(),
    code: z.string(),
    fontSize: z.number().positive(),
    lineHeight: z.number().positive(),
    showLineNumbers: z.boolean(),
    background: z.string().min(1),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    width: 2.4,
    height: 1.5,
    depth: 0.05,
    title: 'hero.tsx',
    language: 'TSX',
    code: [
      'export function Hero() {',
      '  const frames = useMotion();',
      '  return <Stage frames={frames} />;',
      '}',
    ].join('\n'),
    fontSize: 0.072,
    lineHeight: 1.5,
    showLineNumbers: true,
    background: '#0c1119',
    color: '#c9d4e3',
    accentColor: '#5885f7',
    opacity: 1,
  },
  animatableProperties: { opacity: { description: 'Code card opacity.' } },
  defaultName: 'Code card',
  propertyHints: {
    title: { label: 'File name', control: 'text', group: 'Content' },
    language: { label: 'Language', control: 'text', group: 'Content' },
    code: { label: 'Code', control: 'textarea', group: 'Content' },
    ...sharedHints,
    depth: { label: 'Depth', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
    fontSize: { label: 'Font size', control: 'number', min: 0.02, step: 0.005, group: 'Typography' },
    lineHeight: { label: 'Line height', control: 'number', min: 0.8, step: 0.05, group: 'Typography' },
    showLineNumbers: { label: 'Line numbers', control: 'toggle', group: 'Typography' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Text color', control: 'color', group: 'Appearance' },
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
  },
};

export const uiAnnotation: MotionNodeTypeDefinition = {
  id: 'ui.annotation',
  label: 'Annotation',
  category: 'ui',
  description: 'A floating callout card for feature labels and benefit captions.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    title: z.string(),
    body: z.string(),
    accentColor: z.string().min(1),
    background: z.string().min(1),
    color: z.string().min(1),
    align: z.enum(['left', 'center']),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    width: 2.2,
    height: 1,
    title: 'Instant preview',
    body: 'Every edit renders on the next frame.',
    accentColor: '#59c7a6',
    background: '#101722',
    color: '#e8eef8',
    align: 'left',
    opacity: 1,
  },
  animatableProperties: { opacity: { description: 'Annotation opacity.' } },
  defaultName: 'Annotation',
  propertyHints: {
    title: { label: 'Title', control: 'text', group: 'Content' },
    body: { label: 'Body', control: 'textarea', group: 'Content' },
    ...sharedHints,
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Text color', control: 'color', group: 'Appearance' },
    align: {
      label: 'Alignment',
      control: 'segmented',
      group: 'Typography',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
      ],
    },
  },
};

export const uiTerminal: MotionNodeTypeDefinition = {
  id: 'ui.terminal',
  label: 'Terminal',
  category: 'ui',
  description: 'A terminal window with prompt lines.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    title: z.string(),
    lines: z.array(z.string()).max(40),
    prompt: z.string(),
    fontSize: z.number().positive(),
    background: z.string().min(1),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { width: 3.6, height: 2.2, title: 'terminal', lines: ['$ bun run build', '✓ built in 3m 25s', '$'], prompt: '$', fontSize: 0.085, background: '#0b1017', color: '#c9d4e3', accentColor: '#59c7a6', opacity: 1 },
  animatableProperties: { opacity: { description: 'Terminal opacity.' } },
  defaultName: 'Terminal',
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.5, step: 0.1, group: 'Dimensions' },
    title: { label: 'Title', control: 'text', group: 'Content' },
    lines: { label: 'Lines', control: 'textarea', group: 'Content' },
    prompt: { label: 'Prompt', control: 'text', group: 'Content' },
    fontSize: { label: 'Font size', control: 'number', min: 0.03, step: 0.005, group: 'Typography' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Text color', control: 'color', group: 'Appearance' },
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const uiChat: MotionNodeTypeDefinition = {
  id: 'ui.chat',
  label: 'Chat',
  category: 'ui',
  description: 'A chat conversation mockup.',
  propsSchema: z.object({
    width: z.number().positive(),
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })).min(1).max(8),
    fontSize: z.number().positive(),
    userColor: z.string().min(1),
    assistantColor: z.string().min(1),
    background: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { width: 3.2, messages: [{ role: 'user', text: 'How do I export?' }, { role: 'assistant', text: 'Pick a preset, then Export.' }], fontSize: 0.1, userColor: '#5885f7', assistantColor: '#1b2230', background: '#0e131c', opacity: 1 },
  animatableProperties: { opacity: { description: 'Chat opacity.' } },
  defaultName: 'Chat',
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 1, step: 0.1, group: 'Dimensions' },
    messages: { label: 'Messages', control: 'textarea', group: 'Content' },
    fontSize: { label: 'Font size', control: 'number', min: 0.05, step: 0.01, group: 'Typography' },
    userColor: { label: 'User bubble', control: 'color', group: 'Appearance' },
    assistantColor: { label: 'Assistant bubble', control: 'color', group: 'Appearance' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const uiCursor: MotionNodeTypeDefinition = {
  id: 'ui.cursor',
  label: 'Cursor',
  category: 'ui',
  description: 'An animated pointer for app demos.',
  propsSchema: z.object({
    size: z.number().positive(),
    color: z.string().min(1),
    label: z.string().optional(),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { size: 0.35, color: '#ffffff', label: 'Click', opacity: 1 },
  animatableProperties: { opacity: { description: 'Cursor opacity.' } },
  defaultName: 'Cursor',
  propertyHints: {
    size: { label: 'Size', control: 'number', min: 0.1, step: 0.05, group: 'Dimensions' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    label: { label: 'Label', control: 'text', group: 'Content', optional: true },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const uiNotification: MotionNodeTypeDefinition = {
  id: 'ui.notification',
  label: 'Notification',
  category: 'ui',
  description: 'A toast notification card.',
  propsSchema: z.object({
    title: z.string(),
    body: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    accentColor: z.string().min(1),
    background: z.string().min(1),
    color: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { title: 'Saved', body: 'Your changes are live.', width: 2.6, height: 0.7, accentColor: '#59c7a6', background: '#101722', color: '#e8eef8', opacity: 1 },
  animatableProperties: { opacity: { description: 'Notification opacity.' } },
  defaultName: 'Notification',
  propertyHints: {
    title: { label: 'Title', control: 'text', group: 'Content' },
    body: { label: 'Body', control: 'text', group: 'Content' },
    width: { label: 'Width', control: 'number', min: 1, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.3, step: 0.05, group: 'Dimensions' },
    accentColor: { label: 'Accent', control: 'color', group: 'Appearance' },
    background: { label: 'Background', control: 'color', group: 'Appearance' },
    color: { label: 'Text color', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const uiNodes: readonly MotionNodeTypeDefinition[] = [uiBrowser, uiCode, uiAnnotation, uiTerminal, uiChat, uiCursor, uiNotification];
