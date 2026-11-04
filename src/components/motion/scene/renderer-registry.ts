/**
 * components/motion/scene/renderer-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lookup table from node type to Three.js binding. Kept separate from both the
 * implementations (`./nodes/*`) and the canvas so neither has to import the
 * other: implementations register here, the canvas reads here.
 */

import type { ComponentType } from 'react';

import type { MotionDocument, MotionNode } from '@/lib/motion/types';

/** Time a media binding needs to stay frame-locked to the playhead. */
export type MotionNodeTimeSource = {
  getTime(): number;
  isPlaying(): boolean;
};

/**
 * Renderers resolve assets from the document they are painting, never from the
 * editor store: the export window renders a document that is not loaded there.
 * The clock is passed for the same reason: video must lock to the render window's
 * clock, not the editor's.
 */
export type MotionThreeNodeRendererProps = {
  node: MotionNode;
  document: MotionDocument;
  clock: MotionNodeTimeSource;
};

export type MotionThreeNodeRenderer = ComponentType<MotionThreeNodeRendererProps>;

const renderers = new Map<string, MotionThreeNodeRenderer>();

export function registerMotionThreeRenderer(
  nodeType: string,
  renderer: MotionThreeNodeRenderer,
): void {
  if (renderers.has(nodeType)) {
    throw new Error(`Three.js renderer already registered for Motion node "${nodeType}".`);
  }
  renderers.set(nodeType, renderer);
}

export function getMotionThreeRenderer(nodeType: string): MotionThreeNodeRenderer | undefined {
  return renderers.get(nodeType);
}
