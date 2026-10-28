/**
 * registry.ts — Closed map of node kinds to primitive factories.
 *
 * The registry is the only place the render worker is allowed to construct
 * scene objects. Unknown kinds (including the modifier nodes, which have no 3D
 * representation) are skipped by SceneBuilder rather than executed dynamically.
 */

import type * as THREE from "three"

import type { NodeInstance } from "../scene-builder"
import { createGridPlane } from "./grid-plane"
import { createImagePlane } from "./image-plane"
import { createParticleField } from "./particle-field"
import { createPulseSphere } from "./pulse-sphere"
import { createRadialRing } from "./radial-ring"
import { createSpectrumBars } from "./spectrum-bars"
import { createStepSequencer } from "./step-sequencer"
import { createTextTitle } from "./text-title"
import { createWaveformLine } from "./waveform-line"
import { createFloorMirror } from "./floor-mirror"

export type PrimitiveContext = {
  three: typeof THREE
  params: Record<string, unknown>
  id: string
}

export type PrimitiveFactory = (ctx: PrimitiveContext) => NodeInstance

export const PRIMITIVE_REGISTRY: Record<string, PrimitiveFactory> = {
  spectrumBars: createSpectrumBars,
  radialRing: createRadialRing,
  waveformLine: createWaveformLine,
  pulseSphere: createPulseSphere,
  particleField: createParticleField,
  gridPlane: createGridPlane,
  textTitle: createTextTitle,
  imagePlane: createImagePlane,
  floorMirror: createFloorMirror,
  stepSequencer: createStepSequencer,
}
