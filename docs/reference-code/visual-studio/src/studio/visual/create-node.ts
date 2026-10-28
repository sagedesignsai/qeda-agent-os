import type { RFNode } from "./compile"
import { defaultParamsFor, KIND_PALETTE, MANIFEST } from "./manifest"
import type { NodeKind } from "./types"

/** Build a graph node with manifest defaults. Arrays are cloned by defaultParamsFor. */
export function createVisualNode(
  kind: NodeKind,
  position: { x: number; y: number }
): RFNode {
  const entry = MANIFEST[kind]
  return {
    id: crypto.randomUUID(),
    type: kind,
    position,
    data: {
      params: defaultParamsFor(kind),
      ...(entry.category === "visual"
        ? {
            transform: {
              position: { x: position.x * 0.01, y: 0, z: position.y * 0.01 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
          }
        : {}),
      // Scene-only nodes (camera, background, audio source) have no feature
      // binding; sending one would fail graph validation.
      ...(entry.featureBinding.length
        ? {
            binding: {
              feature: entry.featureBinding[0],
              gain: 1,
              smoothing: 0.2,
            },
          }
        : {}),
      palette: { ...KIND_PALETTE[kind] },
    },
  }
}
