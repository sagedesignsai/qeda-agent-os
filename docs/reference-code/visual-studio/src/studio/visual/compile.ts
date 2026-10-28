/**
 * compile.ts — Pure function that converts a React Flow graph into a SceneProgram.
 *
 * No side effects. Safe to call in any context (main thread, worker, tests).
 */

import type { NodeManifestEntry } from "./manifest"
import { KIND_PALETTE } from "./manifest"
import type {
  FeatureName,
  LightingPreset,
  NodeBinding,
  NodeKind,
  NodeTransform,
  ParamValue,
  SceneProgram,
  SceneProgramNode,
  TimelineMarker,
  VisualEventSettings,
} from "./types"

// ---------------------------------------------------------------------------
// React Flow graph types
// ---------------------------------------------------------------------------

export type RFNodeData = {
  params: Record<string, unknown>
  binding?: { feature: FeatureName; gain: number; smoothing: number }
  palette?: { color: string; emissive: string }
  transform?: NodeTransform
  events?: VisualEventSettings
}

export type RFNode = {
  id: string
  type: NodeKind
  position: { x: number; y: number }
  data: RFNodeData
  selected?: boolean
}

export type RFEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: Record<string, unknown>
}

export type RFGraph = {
  nodes: RFNode[]
  edges: RFEdge[]
  viewport: { x: number; y: number; zoom: number }
  markers?: TimelineMarker[]
}

// ---------------------------------------------------------------------------
// Compile result
// ---------------------------------------------------------------------------

export type CompileResult =
  { ok: true; program: SceneProgram } | { ok: false; errors: string[] }

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const SCENE_ONLY_KINDS = new Set<NodeKind>([
  "cameraRig",
  "background",
  "lightingRig",
])

const DEFAULT_CAMERA: SceneProgram["camera"] = {
  position: [0, 3, 8],
  target: [0, 0, 0],
  fov: 60,
  orbitAmount: 0,
  orbitSpeed: 0.35,
  audioOrbit: 0,
  orbitFeature: "rms",
  shakeAmount: 0,
  shakeSpeed: 16,
  shakeFeature: "onset",
}

const DEFAULT_ENVIRONMENT: SceneProgram["environment"] = {
  background: "#0a0a0a",
  style: "solid",
  skyTop: "#080b18",
  horizonColor: "#282348",
}

const DEFAULT_LIGHTING: SceneProgram["lighting"] = {
  preset: "balanced",
  ambientIntensity: 0.6,
  keyIntensity: 1.2,
  keyColor: "#fff0dc",
  fillIntensity: 0,
  fillColor: "#8faeff",
  rimIntensity: 0,
  rimColor: "#49d9ff",
}

const DEFAULT_BINDING: NodeBinding = {
  feature: "rms",
  gain: 1,
  smoothing: 0.2,
}

const DEFAULT_PALETTE = { color: "#ffffff", emissive: "#000000" }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isParamValue(value: unknown): value is ParamValue {
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  return (
    Array.isArray(value) && value.every((item) => typeof item === "boolean")
  )
}

/**
 * Merge manifest defaults with node params. Non-primitive values are ignored,
 * except boolean arrays (the step-sequencer pattern), which are copied.
 */
function mergeParams(
  manifestDefaults: Record<string, unknown>,
  nodeParams: Record<string, unknown>
): Record<string, ParamValue> {
  const result: Record<string, ParamValue> = {}

  for (const [key, defaultVal] of Object.entries(manifestDefaults)) {
    const incoming = nodeParams[key]

    if (isParamValue(incoming)) {
      result[key] = Array.isArray(incoming) ? [...incoming] : incoming
      continue
    }

    if (isParamValue(defaultVal)) {
      result[key] = Array.isArray(defaultVal) ? [...defaultVal] : defaultVal
    }
  }

  return result
}

/**
 * Extract camera settings from a cameraRig node's params.
 */
function extractCamera(
  node: RFNode,
  manifestDefaults: Record<string, unknown>
): SceneProgram["camera"] {
  const p = mergeParams(manifestDefaults, node.data.params)
  return {
    position: [
      (p["posX"] as number) ?? 0,
      (p["posY"] as number) ?? 3,
      (p["posZ"] as number) ?? 8,
    ],
    target: [
      (p["targetX"] as number) ?? 0,
      (p["targetY"] as number) ?? 0,
      (p["targetZ"] as number) ?? 0,
    ],
    fov: (p["fov"] as number) ?? 60,
    orbitAmount: (p["orbitAmount"] as number) ?? 0,
    orbitSpeed: (p["orbitSpeed"] as number) ?? 0.35,
    audioOrbit: (p["audioOrbit"] as number) ?? 0,
    orbitFeature: (p["orbitFeature"] as FeatureName) ?? "rms",
    shakeAmount: (p["shakeAmount"] as number) ?? 0,
    shakeSpeed: (p["shakeSpeed"] as number) ?? 16,
    shakeFeature: (p["shakeFeature"] as FeatureName) ?? "onset",
  }
}

/**
 * Extract environment settings from a background node's params.
 */
function extractEnvironment(
  node: RFNode,
  manifestDefaults: Record<string, unknown>
): SceneProgram["environment"] {
  const p = mergeParams(manifestDefaults, node.data.params)
  const env: SceneProgram["environment"] = {
    background: (p["color"] as string) ?? "#0a0a0a",
    style: (p["style"] as SceneProgram["environment"]["style"]) ?? "solid",
    skyTop: (p["skyTop"] as string) ?? "#080b18",
    horizonColor: (p["horizonColor"] as string) ?? "#282348",
  }
  if (p["fogEnabled"]) {
    env.fogColor = (p["fogColor"] as string) ?? "#0a0a0a"
    env.fogNear = (p["fogNear"] as number) ?? 10
    env.fogFar = (p["fogFar"] as number) ?? 100
  }
  return env
}

function extractLighting(
  node: RFNode,
  manifestDefaults: Record<string, unknown>
): SceneProgram["lighting"] {
  const p = mergeParams(manifestDefaults, node.data.params)
  return {
    preset: (p["preset"] as LightingPreset) ?? "balanced",
    ambientIntensity: (p["ambientIntensity"] as number) ?? 0.6,
    keyIntensity: (p["keyIntensity"] as number) ?? 1.2,
    keyColor: (p["keyColor"] as string) ?? "#fff0dc",
    fillIntensity: (p["fillIntensity"] as number) ?? 0,
    fillColor: (p["fillColor"] as string) ?? "#8faeff",
    rimIntensity: (p["rimIntensity"] as number) ?? 0,
    rimColor: (p["rimColor"] as string) ?? "#49d9ff",
  }
}

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

export function compile(
  graph: RFGraph,
  manifest: Record<NodeKind, NodeManifestEntry>
): CompileResult {
  const errors: string[] = []

  // Partition nodes by known/unknown and by special vs rendered
  const knownNodes: RFNode[] = []
  const sceneNodes: {
    cameraRig?: RFNode
    background?: RFNode
    lightingRig?: RFNode
  } = {}

  for (const node of graph.nodes) {
    if (!(node.type in manifest)) {
      // Unknown kind — warn to console but don't fail
      console.warn(
        `[compile] Unknown node kind "${node.type}" (id=${node.id}) — skipped.`
      )
      continue
    }
    knownNodes.push(node)

    if (node.type === "cameraRig") {
      sceneNodes.cameraRig = node
    } else if (node.type === "background") {
      sceneNodes.background = node
    } else if (node.type === "lightingRig") {
      sceneNodes.lightingRig = node
    }
  }

  // Build rendered SceneProgramNodes (skip audioSource / cameraRig / background)
  const renderedNodes: SceneProgramNode[] = []

  for (const node of knownNodes) {
    if (SCENE_ONLY_KINDS.has(node.type)) continue

    const entry = manifest[node.type]

    const params = mergeParams(entry.defaults, node.data.params)

    const binding: NodeBinding =
      node.data.binding != null
        ? {
            feature: node.data.binding.feature,
            gain: node.data.binding.gain,
            smoothing: node.data.binding.smoothing,
          }
        : {
            ...DEFAULT_BINDING,
            feature: entry.featureBinding[0] ?? DEFAULT_BINDING.feature,
          }

    const palette =
      node.data.palette != null
        ? { ...node.data.palette }
        : { ...(KIND_PALETTE[node.type] ?? DEFAULT_PALETTE) }

    // The palette is the default colour control. Primitives with their own
    // colour params (textTitle's `color`, gridPlane's `lineColor`) keep an
    // explicit non-default value, while an untouched param follows the palette.
    const colorKey =
      typeof entry.defaults.lineColor === "string" ? "lineColor" : "color"
    if (typeof entry.defaults[colorKey] === "string") {
      if (params[colorKey] === entry.defaults[colorKey]) {
        params[colorKey] = palette.color
      }
    } else {
      params.color = palette.color
    }
    params.emissive = palette.emissive

    const sceneProgramNode: SceneProgramNode = {
      id: node.id,
      kind: node.type,
      transform: (() => {
        const transform = node.data.transform
        return transform
          ? {
              position: [
                transform.position.x,
                transform.position.y,
                transform.position.z,
              ] as [number, number, number],
              rotation: [
                (transform.rotation.x * Math.PI) / 180,
                (transform.rotation.y * Math.PI) / 180,
                (transform.rotation.z * Math.PI) / 180,
              ] as [number, number, number],
              scale: [
                transform.scale.x,
                transform.scale.y,
                transform.scale.z,
              ] as [number, number, number],
            }
          : {
              // Legacy graphs used React Flow placement as scene position.
              position: [node.position.x * 0.01, 0, node.position.y * 0.01],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            }
      })(),
      params,
      binding,
      palette,
      ...(node.data.events ? { events: node.data.events } : {}),
    }

    renderedNodes.push(sceneProgramNode)
  }

  // Extract camera
  const camera =
    sceneNodes.cameraRig != null
      ? extractCamera(sceneNodes.cameraRig, manifest["cameraRig"].defaults)
      : { ...DEFAULT_CAMERA }

  // Extract environment
  const environment =
    sceneNodes.background != null
      ? extractEnvironment(
          sceneNodes.background,
          manifest["background"].defaults
        )
      : { ...DEFAULT_ENVIRONMENT }

  const lighting =
    sceneNodes.lightingRig != null
      ? extractLighting(
          sceneNodes.lightingRig,
          manifest["lightingRig"].defaults
        )
      : { ...DEFAULT_LIGHTING }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const program: SceneProgram = {
    version: 1,
    nodes: renderedNodes,
    edges: graph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
    markers: graph.markers ?? [],
    camera,
    environment,
    lighting,
  }

  return { ok: true, program }
}

// ---------------------------------------------------------------------------
// compileOrThrow()
// ---------------------------------------------------------------------------

export function compileOrThrow(
  graph: RFGraph,
  manifest: Record<NodeKind, NodeManifestEntry>
): SceneProgram {
  const result = compile(graph, manifest)
  if (!result.ok) {
    throw new Error(`Scene compile failed:\n${result.errors.join("\n")}`)
  }
  return result.program
}
