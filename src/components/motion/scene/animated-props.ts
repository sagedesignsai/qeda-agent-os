/**
 * components/motion/scene/animated-props.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Registry of per-node animated-prop appliers. A renderer tags meshes with
 * `userData.motionRole` (and `motionPartIndex` for repeated children) on mount;
 * the applier mutates those meshes from the evaluated node on every frame so
 * progress/values animate without a React re-render, keeping the export
 * renderer frame-exact with the editor.
 */

import type { Group } from 'three';

import type { MotionNode } from '@/lib/motion/types';

export type MotionAnimatedPropApplier = (group: Group, node: MotionNode) => void;

const appliers = new Map<string, MotionAnimatedPropApplier>();

export function registerMotionAnimatedPropApplier(type: string, applier: MotionAnimatedPropApplier): void {
  appliers.set(type, applier);
}

export function getMotionAnimatedPropApplier(type: string): MotionAnimatedPropApplier | undefined {
  return appliers.get(type);
}