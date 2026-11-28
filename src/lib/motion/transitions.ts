/**
 * lib/motion/transitions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shader transitions are a small, closed vocabulary shared by the document
 * schema, the shot strip and the export compositor. Keeping the list here stops
 * a select option from reaching the renderer without a matching program.
 */

export const MOTION_SHADER_TRANSITIONS = [
  { id: 'domain-warp', label: 'Domain warp' },
  { id: 'ridged-burn', label: 'Ridged burn' },
  { id: 'whip-pan', label: 'Whip pan' },
  { id: 'sdf-iris', label: 'Iris wipe' },
  { id: 'ripple-waves', label: 'Ripple' },
  { id: 'gravitational-lens', label: 'Gravity lens' },
  { id: 'cinematic-zoom', label: 'Cinematic zoom' },
  { id: 'chromatic-split', label: 'Chromatic split' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'swirl-vortex', label: 'Swirl vortex' },
  { id: 'thermal-distortion', label: 'Thermal' },
  { id: 'flash-through-white', label: 'Flash white' },
  { id: 'cross-warp-morph', label: 'Cross warp' },
  { id: 'light-leak', label: 'Light leak' },
] as const;

export type MotionShaderTransitionName =
  (typeof MOTION_SHADER_TRANSITIONS)[number]['id'];

export const MOTION_SHADER_TRANSITION_IDS = MOTION_SHADER_TRANSITIONS.map(
  (transition) => transition.id,
) as [MotionShaderTransitionName, ...MotionShaderTransitionName[]];

export function isMotionShaderTransitionName(
  value: unknown,
): value is MotionShaderTransitionName {
  return (
    typeof value === 'string' &&
    MOTION_SHADER_TRANSITIONS.some((transition) => transition.id === value)
  );
}

export function describeMotionTransition(
  type: string,
  shader?: string | null,
): string {
  if (type === 'shader') {
    return MOTION_SHADER_TRANSITIONS.find((item) => item.id === shader)?.label ?? 'Shader';
  }
  if (type === 'crossfade') return 'Fade';
  if (type === 'dip') return 'Dip';
  return 'Cut';
}