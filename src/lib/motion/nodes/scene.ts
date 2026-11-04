/**
 * lib/motion/nodes/scene.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene-level primitives: containers that only exist to parent and modulate
 * their children. A group renders nothing of its own.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const hints: Record<string, MotionPropertyHint> = {
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
};

export const sceneGroup: MotionNodeTypeDefinition = {
  id: 'scene.group',
  label: 'Group',
  category: 'scene',
  description: 'A transformable parent for organizing scene objects.',
  propsSchema: z.object({ opacity: z.number().min(0).max(1).default(1) }),
  defaultProps: { opacity: 1 },
  animatableProperties: {
    opacity: { description: 'Group opacity inherited by its child nodes.' },
  },
  defaultName: 'Group',
  propertyHints: hints,
};
