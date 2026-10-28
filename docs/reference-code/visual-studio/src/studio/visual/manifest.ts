/**
 * Node manifest — single source of truth for all 17 visual editor node kinds.
 * Defines labels, categories, port specs, param specs, defaults, and Zod validators.
 */

import { z } from "zod"
import { FEATURE_NAMES, NODE_KINDS } from "./types"
import type { FeatureName, NodeKind, ParamSpec, PortSpec } from "./types"

// ---------------------------------------------------------------------------
// NodeManifestEntry
// ---------------------------------------------------------------------------

export type NodeManifestEntry = {
  kind: NodeKind
  label: string
  category: "source" | "modifier" | "visual" | "scene"
  description: string
  singleton?: boolean
  featureBinding: FeatureName[]
  inputs: PortSpec[]
  outputs: PortSpec[]
  params: Record<string, ParamSpec>
  defaults: Record<string, unknown>
  zod: z.ZodObject<z.ZodRawShape>
}

// ---------------------------------------------------------------------------
// Helper — build `defaults` and `zod` from params automatically
// ---------------------------------------------------------------------------

function deriveDefaults(
  params: Record<string, ParamSpec>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(params)) {
    out[key] = spec.default
  }
  return out
}

function zodField(spec: ParamSpec): z.ZodTypeAny {
  switch (spec.type) {
    case "number":
      return z.number().min(spec.min).max(spec.max)
    case "integer":
      return z.number().int().min(spec.min).max(spec.max)
    case "boolean":
      return z.boolean()
    case "string":
      return spec.maxLength ? z.string().max(spec.maxLength) : z.string()
    case "select":
      return z.enum(spec.options as [string, ...string[]])
    case "color":
      return z.string().regex(/^#[0-9a-fA-F]{6}$/)
    case "mediaId":
      return z.string().nullable()
    case "booleanList":
      return z.array(z.boolean()).min(spec.length.min).max(spec.length.max)
  }
}

function buildZod(
  params: Record<string, ParamSpec>
): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, spec] of Object.entries(params)) {
    shape[key] = zodField(spec).optional()
  }
  return z.object(shape)
}

// ---------------------------------------------------------------------------
// MANIFEST
// ---------------------------------------------------------------------------

const audioSourceParams = {
  feature: {
    type: "select",
    options: [...FEATURE_NAMES],
    default: "rms",
    label: "Feature",
  } satisfies ParamSpec,
  smoothing: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.8,
    label: "Smoothing",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const bandAmplitudeParams = {
  band: {
    type: "integer",
    min: 0,
    max: 7,
    default: 0,
    label: "Band",
  } satisfies ParamSpec,
  gain: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    label: "Gain",
  } satisfies ParamSpec,
  offset: {
    type: "number",
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    label: "Offset",
  } satisfies ParamSpec,
  smoothing: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    label: "Smoothing",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const envelopeFollowerParams = {
  attack: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.001,
    default: 0.01,
    label: "Attack",
  } satisfies ParamSpec,
  release: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.001,
    default: 0.1,
    label: "Release",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const oscillatorParams = {
  rate: {
    type: "number",
    min: 0.01,
    max: 20,
    step: 0.01,
    default: 1,
    label: "Rate (Hz)",
  } satisfies ParamSpec,
  phase: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    label: "Phase",
  } satisfies ParamSpec,
  waveform: {
    type: "select",
    options: ["sine", "tri", "square", "saw"],
    default: "sine",
    label: "Waveform",
  } satisfies ParamSpec,
  depth: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    label: "Depth",
  } satisfies ParamSpec,
  offset: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    label: "Offset",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const mathCombineParams = {
  op: {
    type: "select",
    options: ["add", "mul", "sub", "max", "min"],
    default: "add",
    label: "Operation",
  } satisfies ParamSpec,
  scale: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    label: "Scale",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const spectrumBarsParams = {
  bars: {
    type: "integer",
    min: 8,
    max: 64,
    default: 32,
    label: "Bar Count",
  } satisfies ParamSpec,
  gain: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    label: "Gain",
  } satisfies ParamSpec,
  floorDb: {
    type: "number",
    min: -90,
    max: 0,
    step: 1,
    default: -60,
    label: "Floor dB",
  } satisfies ParamSpec,
  height: {
    type: "number",
    min: 0,
    max: 10,
    step: 0.1,
    default: 3,
    label: "Height",
  } satisfies ParamSpec,
  spacing: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.1,
    label: "Spacing",
  } satisfies ParamSpec,
  layout: {
    type: "select",
    options: ["linear", "radial"],
    default: "linear",
    label: "Layout",
  } satisfies ParamSpec,
  colorMode: {
    type: "select",
    options: ["solid", "gradient", "band"],
    default: "solid",
    label: "Color Mode",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const radialRingParams = {
  ringCount: {
    type: "integer",
    min: 1,
    max: 8,
    default: 3,
    label: "Ring Count",
  } satisfies ParamSpec,
  baseRadius: {
    type: "number",
    min: 0,
    max: 10,
    step: 0.1,
    default: 2,
    label: "Base Radius",
  } satisfies ParamSpec,
  thickness: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.05,
    label: "Thickness",
  } satisfies ParamSpec,
  band: {
    type: "integer",
    min: 0,
    max: 7,
    default: 0,
    label: "Band",
  } satisfies ParamSpec,
  gain: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    label: "Gain",
  } satisfies ParamSpec,
  smoothing: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    label: "Smoothing",
  } satisfies ParamSpec,
  spin: {
    type: "number",
    min: -2,
    max: 2,
    step: 0.01,
    default: 0,
    label: "Spin Speed",
  } satisfies ParamSpec,
  springStiffness: {
    type: "number",
    min: 1,
    max: 100,
    step: 1,
    default: 32,
    label: "Spring Stiffness",
  } satisfies ParamSpec,
  springDamping: {
    type: "number",
    min: 0,
    max: 24,
    step: 0.1,
    default: 4,
    label: "Spring Damping",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const waveformLineParams = {
  samples: {
    type: "integer",
    min: 64,
    max: 2048,
    default: 512,
    label: "Samples",
  } satisfies ParamSpec,
  amplitude: {
    type: "number",
    min: 0,
    max: 10,
    step: 0.1,
    default: 2,
    label: "Amplitude",
  } satisfies ParamSpec,
  thickness: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.02,
    label: "Thickness",
  } satisfies ParamSpec,
  colorMode: {
    type: "select",
    options: ["solid", "rainbow", "energy"],
    default: "solid",
    label: "Color Mode",
  } satisfies ParamSpec,
  phase: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    label: "Phase",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const pulseSphereParams = {
  radius: {
    type: "number",
    min: 0,
    max: 5,
    step: 0.1,
    default: 1,
    label: "Radius",
  } satisfies ParamSpec,
  band: {
    type: "integer",
    min: 0,
    max: 7,
    default: 0,
    label: "Band",
  } satisfies ParamSpec,
  gain: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    label: "Gain",
  } satisfies ParamSpec,
  smoothing: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    label: "Smoothing",
  } satisfies ParamSpec,
  subdivisions: {
    type: "integer",
    min: 1,
    max: 5,
    default: 3,
    label: "Subdivisions",
  } satisfies ParamSpec,
  deformation: {
    type: "number",
    min: 0,
    max: 0.75,
    step: 0.01,
    default: 0.2,
    label: "Deformation",
  } satisfies ParamSpec,
  deformationWaves: {
    type: "integer",
    min: 1,
    max: 12,
    default: 4,
    label: "Deformation Waves",
  } satisfies ParamSpec,
  wireframe: {
    type: "boolean",
    default: false,
    label: "Wireframe",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const particleFieldParams = {
  count: {
    type: "integer",
    min: 100,
    max: 20000,
    default: 2000,
    label: "Particle Count",
  } satisfies ParamSpec,
  spread: {
    type: "number",
    min: 1,
    max: 50,
    step: 0.1,
    default: 10,
    label: "Spread",
  } satisfies ParamSpec,
  bandRange: {
    type: "select",
    options: ["bass", "full", "high"],
    default: "full",
    label: "Band Range",
  } satisfies ParamSpec,
  size: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.05,
    label: "Particle Size",
  } satisfies ParamSpec,
  turbulence: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.3,
    label: "Turbulence",
  } satisfies ParamSpec,
  colorMode: {
    type: "select",
    options: ["solid", "velocity", "band"],
    default: "solid",
    label: "Color Mode",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const gridPlaneParams = {
  cellSize: {
    type: "number",
    min: 0.1,
    max: 10,
    step: 0.1,
    default: 1,
    label: "Cell Size",
  } satisfies ParamSpec,
  lineColor: {
    type: "color",
    default: "#00ffff",
    label: "Line Color",
  } satisfies ParamSpec,
  glow: {
    type: "boolean",
    default: true,
    label: "Glow",
  } satisfies ParamSpec,
  scrollSpeed: {
    type: "number",
    min: 0,
    max: 5,
    step: 0.01,
    default: 0.5,
    label: "Scroll Speed",
  } satisfies ParamSpec,
  waveAmount: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.2,
    label: "Wave Amount",
  } satisfies ParamSpec,
  rippleAmount: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.35,
    label: "Traveling Ripple",
  } satisfies ParamSpec,
  rippleSpeed: {
    type: "number",
    min: 0,
    max: 8,
    step: 0.1,
    default: 2.2,
    label: "Ripple Speed",
  } satisfies ParamSpec,
  rippleFrequency: {
    type: "number",
    min: 0.1,
    max: 8,
    step: 0.1,
    default: 1.8,
    label: "Ripple Spacing",
  } satisfies ParamSpec,
  beatGlow: {
    type: "number",
    min: 0,
    max: 3,
    step: 0.05,
    default: 0.8,
    label: "Beat Flash",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const textTitleParams = {
  text: {
    type: "string",
    default: "SONIC GENIUS",
    label: "Text",
    maxLength: 80,
  } satisfies ParamSpec,
  size: {
    type: "number",
    min: 0,
    max: 5,
    step: 0.1,
    default: 1,
    label: "Size",
  } satisfies ParamSpec,
  color: {
    type: "color",
    default: "#ffffff",
    label: "Color",
  } satisfies ParamSpec,
  depth: {
    type: "number",
    min: -20,
    max: 20,
    step: 0.1,
    default: 0,
    label: "Depth (Z)",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const imagePlaneParams = {
  mediaId: {
    type: "mediaId",
    default: null,
    label: "Image",
  } satisfies ParamSpec,
  size: {
    type: "number",
    min: 0,
    max: 20,
    step: 0.1,
    default: 4,
    label: "Size",
  } satisfies ParamSpec,
  opacity: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    label: "Opacity",
  } satisfies ParamSpec,
  treatment: {
    type: "select",
    options: ["natural", "duotone", "scanline"],
    default: "natural",
    label: "Image Treatment",
  } satisfies ParamSpec,
  haloStrength: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.35,
    label: "Halo Glow",
  } satisfies ParamSpec,
  audioScale: {
    type: "number",
    min: 0,
    max: 0.5,
    step: 0.01,
    default: 0.08,
    label: "Audio Pulse",
  } satisfies ParamSpec,
  revealOnset: {
    type: "boolean",
    default: false,
    label: "Reveal on Onset",
  } satisfies ParamSpec,
  revealDuration: {
    type: "number",
    min: 0.15,
    max: 3,
    step: 0.05,
    default: 0.8,
    label: "Reveal Duration",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const floorMirrorParams = {
  roughness: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.1,
    label: "Roughness",
  } satisfies ParamSpec,
  shadowStrength: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    label: "Shadow Strength",
  } satisfies ParamSpec,
  size: {
    type: "number",
    min: 1,
    max: 50,
    step: 0.5,
    default: 20,
    label: "Size",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const stepSequencerParams = {
  division: {
    type: "select",
    options: ["1/4", "1/8", "1/16"],
    default: "1/8",
    label: "Division",
  } satisfies ParamSpec,
  count: {
    type: "integer",
    min: 4,
    max: 16,
    default: 8,
    label: "Step Count",
  } satisfies ParamSpec,
  strength: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
    label: "Strength",
  } satisfies ParamSpec,
  pattern: {
    type: "booleanList",
    length: { min: 4, max: 16 },
    default: [true, false, true, false, true, false, true, false],
    label: "Pattern",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const cameraRigParams = {
  posX: {
    type: "number",
    min: -100,
    max: 100,
    step: 0.1,
    default: 0,
    label: "Position X",
  } satisfies ParamSpec,
  posY: {
    type: "number",
    min: -100,
    max: 100,
    step: 0.1,
    default: 3,
    label: "Position Y",
  } satisfies ParamSpec,
  posZ: {
    type: "number",
    min: -100,
    max: 100,
    step: 0.1,
    default: 8,
    label: "Position Z",
  } satisfies ParamSpec,
  targetX: {
    type: "number",
    min: -100,
    max: 100,
    step: 0.1,
    default: 0,
    label: "Target X",
  } satisfies ParamSpec,
  targetY: {
    type: "number",
    min: -100,
    max: 100,
    step: 0.1,
    default: 0,
    label: "Target Y",
  } satisfies ParamSpec,
  targetZ: {
    type: "number",
    min: -100,
    max: 100,
    step: 0.1,
    default: 0,
    label: "Target Z",
  } satisfies ParamSpec,
  fov: {
    type: "number",
    min: 20,
    max: 120,
    step: 1,
    default: 60,
    label: "Field of View",
  } satisfies ParamSpec,
  orbitAmount: {
    type: "number",
    min: 0,
    max: 10,
    step: 0.1,
    default: 0,
    label: "Orbit Amount",
  } satisfies ParamSpec,
  orbitSpeed: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 0.35,
    label: "Orbit Speed",
  } satisfies ParamSpec,
  audioOrbit: {
    type: "number",
    min: 0,
    max: 10,
    step: 0.1,
    default: 0,
    label: "Audio Orbit Amount",
  } satisfies ParamSpec,
  orbitFeature: {
    type: "select",
    options: [...FEATURE_NAMES],
    default: "rms",
    label: "Orbit Audio Feature",
  } satisfies ParamSpec,
  shakeAmount: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 0,
    label: "Screen Shake",
  } satisfies ParamSpec,
  shakeSpeed: {
    type: "number",
    min: 1,
    max: 40,
    step: 0.5,
    default: 16,
    label: "Shake Speed",
  } satisfies ParamSpec,
  shakeFeature: {
    type: "select",
    options: [...FEATURE_NAMES],
    default: "onset",
    label: "Shake Audio Feature",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const backgroundParams = {
  style: {
    type: "select",
    options: ["solid", "gradient", "aurora"],
    default: "solid",
    label: "Atmosphere",
  } satisfies ParamSpec,
  color: {
    type: "color",
    default: "#0a0a0a",
    label: "Background Color",
  } satisfies ParamSpec,
  skyTop: {
    type: "color",
    default: "#080b18",
    label: "Sky Top",
  } satisfies ParamSpec,
  horizonColor: {
    type: "color",
    default: "#282348",
    label: "Horizon Color",
  } satisfies ParamSpec,
  fogColor: {
    type: "color",
    default: "#0a0a0a",
    label: "Fog Color",
  } satisfies ParamSpec,
  fogNear: {
    type: "number",
    min: 0,
    max: 100,
    step: 0.5,
    default: 10,
    label: "Fog Near",
  } satisfies ParamSpec,
  fogFar: {
    type: "number",
    min: 1,
    max: 1000,
    step: 1,
    default: 100,
    label: "Fog Far",
  } satisfies ParamSpec,
  fogEnabled: {
    type: "boolean",
    default: false,
    label: "Fog Enabled",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

const lightingRigParams = {
  preset: {
    type: "select",
    options: ["balanced", "cinematic", "neon", "sunset"],
    default: "balanced",
    label: "Lighting Mood",
  } satisfies ParamSpec,
  ambientIntensity: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.6,
    label: "Ambient Fill",
  } satisfies ParamSpec,
  keyIntensity: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 1.2,
    label: "Key Intensity",
  } satisfies ParamSpec,
  keyColor: {
    type: "color",
    default: "#fff0dc",
    label: "Key Light Color",
  } satisfies ParamSpec,
  fillIntensity: {
    type: "number",
    min: 0,
    max: 3,
    step: 0.01,
    default: 0.35,
    label: "Fill Intensity",
  } satisfies ParamSpec,
  fillColor: {
    type: "color",
    default: "#8faeff",
    label: "Fill Light Color",
  } satisfies ParamSpec,
  rimIntensity: {
    type: "number",
    min: 0,
    max: 4,
    step: 0.01,
    default: 0.65,
    label: "Rim Intensity",
  } satisfies ParamSpec,
  rimColor: {
    type: "color",
    default: "#49d9ff",
    label: "Rim Light Color",
  } satisfies ParamSpec,
} as const satisfies Record<string, ParamSpec>

// ---------------------------------------------------------------------------
// MANIFEST
// ---------------------------------------------------------------------------

export const MANIFEST: Record<NodeKind, NodeManifestEntry> = {
  audioSource: {
    kind: "audioSource",
    label: "Audio Source",
    category: "source",
    description: "Reads the analyzed audio features and emits them downstream.",
    singleton: true,
    featureBinding: [],
    inputs: [],
    outputs: [{ id: "out", label: "Audio", kind: "value" }],
    params: audioSourceParams,
    defaults: deriveDefaults(audioSourceParams),
    zod: buildZod(audioSourceParams),
  },

  bandAmplitude: {
    kind: "bandAmplitude",
    label: "Band Amplitude",
    category: "modifier",
    description: "Reads a single frequency band and applies gain and offset.",
    featureBinding: [
      "bass",
      "lowMid",
      "mid",
      "highMid",
      "high",
      "presence",
      "brilliance",
      "air",
    ],
    inputs: [{ id: "in", label: "Value", kind: "value" }],
    outputs: [{ id: "out", label: "Amplitude", kind: "value" }],
    params: bandAmplitudeParams,
    defaults: deriveDefaults(bandAmplitudeParams),
    zod: buildZod(bandAmplitudeParams),
  },

  envelopeFollower: {
    kind: "envelopeFollower",
    label: "Envelope Follower",
    category: "modifier",
    description:
      "Smooths an input signal with independent attack and release times.",
    featureBinding: ["rms", "onset"],
    inputs: [{ id: "in", label: "Value", kind: "value" }],
    outputs: [{ id: "out", label: "Envelope", kind: "value" }],
    params: envelopeFollowerParams,
    defaults: deriveDefaults(envelopeFollowerParams),
    zod: buildZod(envelopeFollowerParams),
  },

  oscillator: {
    kind: "oscillator",
    label: "Oscillator",
    category: "modifier",
    description:
      "Generates a periodic LFO signal to modulate visual parameters.",
    featureBinding: ["tempo", "beat"],
    inputs: [{ id: "sync", label: "Sync", kind: "trigger" }],
    outputs: [{ id: "out", label: "Value", kind: "value" }],
    params: oscillatorParams,
    defaults: deriveDefaults(oscillatorParams),
    zod: buildZod(oscillatorParams),
  },

  mathCombine: {
    kind: "mathCombine",
    label: "Math Combine",
    category: "modifier",
    description: "Combines two input signals with a math operation.",
    featureBinding: [],
    inputs: [
      { id: "a", label: "A", kind: "value" },
      { id: "b", label: "B", kind: "value" },
    ],
    outputs: [{ id: "out", label: "Result", kind: "value" }],
    params: mathCombineParams,
    defaults: deriveDefaults(mathCombineParams),
    zod: buildZod(mathCombineParams),
  },

  spectrumBars: {
    kind: "spectrumBars",
    label: "Spectrum Bars",
    category: "visual",
    description: "Renders a bar graph of frequency band energies.",
    featureBinding: [
      "bass",
      "lowMid",
      "mid",
      "highMid",
      "high",
      "presence",
      "brilliance",
      "air",
    ],
    inputs: [{ id: "in", label: "Amplitude", kind: "value" }],
    outputs: [],
    params: spectrumBarsParams,
    defaults: deriveDefaults(spectrumBarsParams),
    zod: buildZod(spectrumBarsParams),
  },

  radialRing: {
    kind: "radialRing",
    label: "Radial Ring",
    category: "visual",
    description: "Renders concentric rings that pulse with a frequency band.",
    featureBinding: ["bass", "lowMid", "mid", "highMid", "high"],
    inputs: [{ id: "in", label: "Amplitude", kind: "value" }],
    outputs: [],
    params: radialRingParams,
    defaults: deriveDefaults(radialRingParams),
    zod: buildZod(radialRingParams),
  },

  waveformLine: {
    kind: "waveformLine",
    label: "Waveform Line",
    category: "visual",
    description: "Renders a time-domain waveform as a 3D ribbon.",
    featureBinding: ["rms", "onset"],
    inputs: [{ id: "in", label: "Amplitude", kind: "value" }],
    outputs: [],
    params: waveformLineParams,
    defaults: deriveDefaults(waveformLineParams),
    zod: buildZod(waveformLineParams),
  },

  pulseSphere: {
    kind: "pulseSphere",
    label: "Pulse Sphere",
    category: "visual",
    description: "A sphere that scales and deforms with a frequency band.",
    featureBinding: ["bass", "lowMid", "mid", "highMid", "high"],
    inputs: [{ id: "in", label: "Amplitude", kind: "value" }],
    outputs: [],
    params: pulseSphereParams,
    defaults: deriveDefaults(pulseSphereParams),
    zod: buildZod(pulseSphereParams),
  },

  particleField: {
    kind: "particleField",
    label: "Particle Field",
    category: "visual",
    description: "A GPU particle system that reacts to a frequency band range.",
    featureBinding: ["bass", "mid", "high", "rms"],
    inputs: [{ id: "in", label: "Energy", kind: "value" }],
    outputs: [],
    params: particleFieldParams,
    defaults: deriveDefaults(particleFieldParams),
    zod: buildZod(particleFieldParams),
  },

  gridPlane: {
    kind: "gridPlane",
    label: "Grid Plane",
    category: "visual",
    description:
      "A scrolling retro floor with traveling audio ripples and beat-lit color pulses.",
    featureBinding: ["bass", "rms"],
    inputs: [{ id: "in", label: "Wave", kind: "value" }],
    outputs: [],
    params: gridPlaneParams,
    defaults: deriveDefaults(gridPlaneParams),
    zod: buildZod(gridPlaneParams),
  },

  textTitle: {
    kind: "textTitle",
    label: "Text Title",
    category: "visual",
    description: "Renders 3D extruded text in the scene.",
    featureBinding: ["rms", "onset", "beat"],
    inputs: [{ id: "in", label: "Scale", kind: "value" }],
    outputs: [],
    params: textTitleParams,
    defaults: deriveDefaults(textTitleParams),
    zod: buildZod(textTitleParams),
  },

  imagePlane: {
    kind: "imagePlane",
    label: "Image Plane",
    category: "visual",
    description:
      "Stages library artwork with an audio-reactive halo, optional onset reveal, and image treatments.",
    featureBinding: ["rms", "onset"],
    inputs: [{ id: "in", label: "Opacity", kind: "value" }],
    outputs: [],
    params: imagePlaneParams,
    defaults: deriveDefaults(imagePlaneParams),
    zod: buildZod(imagePlaneParams),
  },

  floorMirror: {
    kind: "floorMirror",
    label: "Floor Mirror",
    category: "visual",
    description: "A reflective floor surface with configurable roughness.",
    featureBinding: [],
    inputs: [],
    outputs: [],
    params: floorMirrorParams,
    defaults: deriveDefaults(floorMirrorParams),
    zod: buildZod(floorMirrorParams),
  },

  stepSequencer: {
    kind: "stepSequencer",
    label: "Step Sequencer",
    category: "visual",
    description:
      "A rhythm-locked sequencer that fires visual events on pattern steps.",
    featureBinding: ["beat", "tempo"],
    inputs: [{ id: "clock", label: "Clock", kind: "trigger" }],
    outputs: [{ id: "gate", label: "Gate", kind: "trigger" }],
    params: stepSequencerParams,
    defaults: deriveDefaults(stepSequencerParams),
    zod: buildZod(stepSequencerParams),
  },

  cameraRig: {
    kind: "cameraRig",
    label: "Camera Rig",
    category: "scene",
    description:
      "Controls the scene camera position, target, and field of view.",
    singleton: true,
    featureBinding: [],
    inputs: [],
    outputs: [],
    params: cameraRigParams,
    defaults: deriveDefaults(cameraRigParams),
    zod: buildZod(cameraRigParams),
  },

  background: {
    kind: "background",
    label: "Background",
    category: "scene",
    description: "Sets the scene background color and optional depth fog.",
    singleton: true,
    featureBinding: [],
    inputs: [],
    outputs: [],
    params: backgroundParams,
    defaults: deriveDefaults(backgroundParams),
    zod: buildZod(backgroundParams),
  },
  lightingRig: {
    kind: "lightingRig",
    label: "Lighting Rig",
    category: "scene",
    description:
      "Shapes the scene with an ambient fill and editable key, fill, and rim lights.",
    singleton: true,
    featureBinding: [],
    inputs: [],
    outputs: [],
    params: lightingRigParams,
    defaults: deriveDefaults(lightingRigParams),
    zod: buildZod(lightingRigParams),
  },
}

export const MANIFEST_LIST: NodeManifestEntry[] = Object.values(MANIFEST)

// ---------------------------------------------------------------------------
// Client helpers shared by the palette, inspector and graph
// ---------------------------------------------------------------------------

/**
 * A fresh, deep-cloned params object for a new node. Arrays (the step
 * sequencer pattern) must not be shared between nodes, so this clones them.
 */
export function defaultParamsFor(kind: NodeKind): Record<string, unknown> {
  const defaults = MANIFEST[kind].defaults
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaults)) {
    out[key] = Array.isArray(value) ? [...value] : value
  }
  return out
}

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && NODE_KINDS.includes(value as NodeKind)
}

/** Per-kind starting palette, used by the palette and the compiler fallback. */
export const KIND_PALETTE: Record<
  NodeKind,
  { color: string; emissive: string }
> = {
  audioSource: { color: "#a7b7c9", emissive: "#000000" },
  bandAmplitude: { color: "#a7b7c9", emissive: "#000000" },
  envelopeFollower: { color: "#a7b7c9", emissive: "#000000" },
  oscillator: { color: "#a7b7c9", emissive: "#000000" },
  mathCombine: { color: "#a7b7c9", emissive: "#000000" },
  spectrumBars: { color: "#00ffff", emissive: "#003344" },
  radialRing: { color: "#ff2fb3", emissive: "#3d002a" },
  waveformLine: { color: "#00ffaa", emissive: "#003322" },
  pulseSphere: { color: "#8833ff", emissive: "#220066" },
  particleField: { color: "#88ccff", emissive: "#001133" },
  gridPlane: { color: "#00ffff", emissive: "#001a1a" },
  textTitle: { color: "#ffffff", emissive: "#222222" },
  imagePlane: { color: "#ffffff", emissive: "#000000" },
  floorMirror: { color: "#111111", emissive: "#000000" },
  stepSequencer: { color: "#ffb000", emissive: "#332200" },
  cameraRig: { color: "#a7b7c9", emissive: "#000000" },
  background: { color: "#0a0a0a", emissive: "#000000" },
  lightingRig: { color: "#f6c86b", emissive: "#332100" },
}
