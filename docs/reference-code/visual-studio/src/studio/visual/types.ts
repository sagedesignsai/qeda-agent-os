/**
 * Shared TypeScript types for the Sonic Genius Studio Visual Editor.
 * Safe to import in both the main thread and the render worker.
 * No imports from React or Three.js.
 */

// ---------------------------------------------------------------------------
// Feature names produced by the audioSource node
// ---------------------------------------------------------------------------

export type FeatureName =
  | "bass"
  | "lowMid"
  | "mid"
  | "highMid"
  | "high"
  | "presence"
  | "brilliance"
  | "air"
  | "rms"
  | "onset"
  | "beat"
  | "tempo"

export const FEATURE_NAMES = [
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "high",
  "presence",
  "brilliance",
  "air",
  "rms",
  "onset",
  "beat",
  "tempo",
] as const satisfies readonly FeatureName[]

// ---------------------------------------------------------------------------
// All node kinds
// ---------------------------------------------------------------------------

export type NodeKind =
  | "audioSource"
  | "bandAmplitude"
  | "envelopeFollower"
  | "oscillator"
  | "mathCombine"
  | "spectrumBars"
  | "radialRing"
  | "waveformLine"
  | "pulseSphere"
  | "particleField"
  | "gridPlane"
  | "textTitle"
  | "imagePlane"
  | "floorMirror"
  | "stepSequencer"
  | "cameraRig"
  | "background"
  | "lightingRig"

export const NODE_KINDS = [
  "audioSource",
  "bandAmplitude",
  "envelopeFollower",
  "oscillator",
  "mathCombine",
  "spectrumBars",
  "radialRing",
  "waveformLine",
  "pulseSphere",
  "particleField",
  "gridPlane",
  "textTitle",
  "imagePlane",
  "floorMirror",
  "stepSequencer",
  "cameraRig",
  "background",
  "lightingRig",
] as const satisfies readonly NodeKind[]

// ---------------------------------------------------------------------------
// Param spec — describes one editable parameter
// ---------------------------------------------------------------------------

export type ParamSpec =
  | {
      type: "number"
      min: number
      max: number
      step?: number
      default: number
      label: string
    }
  | {
      type: "integer"
      min: number
      max: number
      default: number
      label: string
    }
  | { type: "boolean"; default: boolean; label: string }
  | { type: "string"; default: string; label: string; maxLength?: number }
  | { type: "select"; options: string[]; default: string; label: string }
  | { type: "color"; default: string; label: string } // hex color string
  | { type: "mediaId"; default: null; label: string } // media library picker
  | {
      type: "booleanList"
      length: { min: number; max: number }
      default: boolean[]
      label: string
    }

/** Values that can cross the main-thread → worker boundary as node params. */
export type ParamValue = number | string | boolean | boolean[]

// ---------------------------------------------------------------------------
// Port spec — declaration for React Flow handles
// ---------------------------------------------------------------------------

export type PortSpec = {
  id: string
  label: string
  kind: "value" | "trigger"
}

// ---------------------------------------------------------------------------
// Node binding — which audio feature drives this node
// ---------------------------------------------------------------------------

export type NodeBinding = {
  feature: FeatureName
  /** Gain multiplier: 0..4 */
  gain: number
  /** One-pole smoothing coefficient: 0..1 */
  smoothing: number
}

/** Editable 3D world transform. Rotation values are stored in degrees. */
export type NodeTransform = {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

export type VisualEventSettings = {
  beat: boolean
  onset: boolean
  timelineMarker: boolean
  thresholdEnabled: boolean
  thresholdFeature: FeatureName
  threshold: number
  action: "pulse" | "flash" | "burst"
  strength: number
  decaySeconds: number
}

export type TimelineMarker = {
  id: string
  time: number
}

export type LightingPreset = "balanced" | "cinematic" | "neon" | "sunset"

// ---------------------------------------------------------------------------
// Compiled scene program sent to the render worker
// ---------------------------------------------------------------------------

export type SceneProgram = {
  version: 1
  nodes: SceneProgramNode[]
  edges: Array<{
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
  }>
  markers: TimelineMarker[]
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    fov: number
    orbitAmount: number
    orbitSpeed: number
    audioOrbit: number
    orbitFeature: FeatureName
    shakeAmount: number
    shakeSpeed: number
    shakeFeature: FeatureName
  }
  environment: {
    background: string
    style: "solid" | "gradient" | "aurora"
    skyTop: string
    horizonColor: string
    fogColor?: string
    fogNear?: number
    fogFar?: number
  }
  lighting: {
    preset: LightingPreset
    ambientIntensity: number
    keyIntensity: number
    keyColor: string
    fillIntensity: number
    fillColor: string
    rimIntensity: number
    rimColor: string
  }
}

export type SceneProgramNode = {
  id: string
  kind: NodeKind
  transform: {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
  }
  params: Record<string, ParamValue>
  binding: NodeBinding
  palette: { color: string; emissive: string }
  events?: VisualEventSettings
}

// ---------------------------------------------------------------------------
// Worker protocol — messages from main thread → worker
// ---------------------------------------------------------------------------

export type MainToWorker =
  | {
      type: "init"
      canvas: OffscreenCanvas
      width: number
      height: number
      dpr: number
    }
  | { type: "setScene"; program: SceneProgram }
  | {
      type: "setTransport"
      playing: boolean
      time: number
      duration: number
      rate: number
    }
  | {
      type: "setFeatures"
      /** null clears the feature store when the audio or analysis changes. */
      features: import("../analysis/format").FeatureArtifact | null
    }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "pick"; x: number; y: number }
  | { type: "capture"; id: string; width: number; height: number }
  | { type: "dispose" }

// ---------------------------------------------------------------------------
// Worker protocol — messages from worker → main thread
// ---------------------------------------------------------------------------

export type WorkerToMain =
  | {
      type: "ready"
      capabilities: {
        workerRaf: boolean
        webgl2: boolean
        maxTextureSize: number
      }
    }
  | {
      type: "frame"
      fps: number
      drawCalls: number
      triangles: number
      droppedFrames: number
    }
  | { type: "pickResult"; nodeId: string | null }
  | { type: "captureResult"; id: string; bitmap: ImageBitmap }
  | { type: "error"; message: string; stack?: string; fatal: boolean }
