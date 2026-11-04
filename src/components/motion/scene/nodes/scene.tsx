/**
 * components/motion/scene/nodes/scene.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Containers and cameras draw nothing themselves: the canvas already supplies a
 * group per node, and the camera is applied by the frame binding.
 */

export function GroupRenderer() {
  return null;
}

export function CameraRenderer() {
  return null;
}
