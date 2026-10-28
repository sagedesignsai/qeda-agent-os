import { createVisualNode } from "./create-node"
import type { RFEdge, RFGraph, RFNode } from "./compile"
import type { NodeKind, NodeTransform } from "./types"

export type VisualTemplateId =
  | "low-end-halo"
  | "spectrum-horizon"
  | "orbit-pulse"
  | "neon-expressway"
  | "sleeve-study"
  | "clockwork-poster"

export const VISUAL_TEMPLATES: Array<{
  id: VisualTemplateId
  name: string
  description: string
  mood: string
  colors: [string, string, string]
  note?: string
}> = [
  {
    id: "low-end-halo",
    name: "Subwoofer chapel",
    description:
      "A slow, luminous ring hangs in a blue-black chapel. Bass loads its spring; each downbeat opens the halo like a lens.",
    mood: "Deep bass / patient light",
    colors: ["#25d9df", "#063b52", "#080d18"],
  },
  {
    id: "spectrum-horizon",
    name: "Glass radio",
    description:
      "A glassy broadcast dial: amber frequencies beneath a drifting pink trace, lit like a late-night radio booth.",
    mood: "Amber glass / live transmission",
    colors: ["#ffbd59", "#f177c7", "#11101b"],
  },
  {
    id: "orbit-pulse",
    name: "Violet tide",
    description:
      "A violet particle tide drifts beneath a breathing aurora. Bass and a slow LFO braid together while the camera gently circles the cloud.",
    mood: "Soft orbit / tidal motion",
    colors: ["#a18aff", "#211142", "#090817"],
  },
  {
    id: "neon-expressway",
    name: "Last train home",
    description:
      "A chrome-violet moon rises over a rippling cyan road beneath a restless aurora. Treble pushes the moon; neon rim light cuts it from the night.",
    mood: "Night drive / wet asphalt",
    colors: ["#d977ff", "#31e4d1", "#080b18"],
  },
  {
    id: "sleeve-study",
    name: "Sleeve in motion",
    description:
      "A listening-room portrait: cover art reveals on the first onset, held by a warm halo and soft sunset lights. Add your own sleeve.",
    mood: "Record sleeve / soft focus",
    colors: ["#f3d5ad", "#cf6b83", "#17121a"],
    note: "Choose cover art in the Image Plane Inspector",
  },
  {
    id: "clockwork-poster",
    name: "Eight-beat theatre",
    description:
      "An eight-pad rhythm machine in a velvet theatre. Brass marquee light and a spring-loaded ring answer the kick; the pattern is ready to remix.",
    mood: "Mechanical rhythm / marquee",
    colors: ["#ffc857", "#f45b69", "#10131b"],
  },
]

function makeNode(
  kind: NodeKind,
  id: string,
  position: { x: number; y: number },
  options: {
    params?: Record<string, unknown>
    palette?: { color: string; emissive: string }
    events?: RFNode["data"]["events"]
    transform?: NodeTransform
  } = {}
): RFNode {
  const node = createVisualNode(kind, position)
  node.id = id
  node.data.params = { ...node.data.params, ...options.params }
  if (options.palette) node.data.palette = options.palette
  if (options.events) node.data.events = options.events
  if (options.transform) node.data.transform = options.transform
  return node
}

function edge(source: string, target: string, targetHandle = "in"): RFEdge {
  return {
    id: `edge-${source}-${target}-${targetHandle}`,
    source,
    target,
    sourceHandle: "out",
    targetHandle,
  }
}

const eventSettings = (
  update: Partial<NonNullable<RFNode["data"]["events"]>>
): NonNullable<RFNode["data"]["events"]> => ({
  beat: false,
  onset: false,
  timelineMarker: false,
  thresholdEnabled: false,
  thresholdFeature: "bass",
  threshold: 0.7,
  action: "pulse",
  strength: 0.65,
  decaySeconds: 0.45,
  ...update,
})

function makeGraph(nodes: RFNode[], edges: RFEdge[] = []): RFGraph {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.8 }, markers: [] }
}

export function createVisualTemplate(id: VisualTemplateId): RFGraph {
  if (id === "low-end-halo") {
    return makeGraph(
      [
        makeNode("audioSource", "audio", { x: 30, y: 160 }, {
          params: { feature: "bass", smoothing: 0.12 },
        }),
        makeNode("bandAmplitude", "weight", { x: 280, y: 160 }, {
          params: { band: 0, gain: 1.25, offset: 0.04 },
        }),
        makeNode("envelopeFollower", "envelope", { x: 530, y: 160 }, {
          params: { attack: 0.025, release: 0.22 },
        }),
        makeNode("radialRing", "halo", { x: 790, y: 160 }, {
          params: { ringCount: 4, baseRadius: 1.8, spin: 0.16, gain: 1.4, springStiffness: 44, springDamping: 3.5 },
          palette: { color: "#25d9df", emissive: "#063b52" },
          transform: transform({ position: { x: 0, y: 0.1, z: 0 } }),
          events: eventSettings({ beat: true, action: "pulse", strength: 0.72 }),
        }),
        makeNode("background", "room", { x: 30, y: 360 }, {
          params: { style: "gradient", color: "#050913", skyTop: "#03050d", horizonColor: "#102b3d", fogEnabled: true, fogColor: "#091728", fogNear: 12, fogFar: 70 },
        }),
        makeNode("cameraRig", "view", { x: 270, y: 360 }, {
          params: { posX: 0, posY: 2.4, posZ: 8.5, targetY: 0, fov: 52, orbitAmount: 0.12, orbitSpeed: 0.14, audioOrbit: 0.24, orbitFeature: "bass" },
        }),
        makeNode("lightingRig", "lights", { x: 530, y: 360 }, {
          params: { preset: "cinematic", ambientIntensity: 0.28, keyIntensity: 0.72, keyColor: "#f6d6b5", fillIntensity: 0.22, fillColor: "#55d8ee", rimIntensity: 0.85, rimColor: "#25d9df" },
        }),
      ],
      [
        edge("audio", "weight"),
        edge("weight", "envelope"),
        edge("envelope", "halo"),
      ]
    )
  }

  if (id === "spectrum-horizon") {
    return makeGraph(
      [
        makeNode("audioSource", "audio", { x: 30, y: 180 }, {
          params: { feature: "rms", smoothing: 0.18 },
        }),
        makeNode("spectrumBars", "spectrum", { x: 360, y: 60 }, {
          params: { bars: 40, height: 3.2, layout: "linear", colorMode: "gradient" },
          palette: { color: "#ffbd59", emissive: "#482306" },
          transform: transform({ position: { x: 0, y: -0.7, z: 0 } }),
          events: eventSettings({ onset: true, action: "flash", strength: 0.55 }),
        }),
        makeNode("waveformLine", "waveform", { x: 360, y: 320 }, {
          params: { amplitude: 1.6, colorMode: "energy" },
          palette: { color: "#f177c7", emissive: "#451333" },
          transform: transform({ position: { x: 0, y: 1.15, z: 0.2 } }),
          events: eventSettings({ onset: true, action: "flash", strength: 0.4 }),
        }),
        makeNode("background", "backdrop", { x: 30, y: 390 }, {
          params: { style: "gradient", color: "#100e1a", skyTop: "#080a18", horizonColor: "#43233c", fogEnabled: true, fogColor: "#171222", fogNear: 18, fogFar: 90 },
        }),
        makeNode("lightingRig", "booth-lights", { x: 360, y: 470 }, {
          params: { preset: "sunset", ambientIntensity: 0.34, keyIntensity: 0.72, keyColor: "#ffd19a", fillIntensity: 0.42, fillColor: "#d48bff", rimIntensity: 0.58, rimColor: "#ff77be" },
        }),
      ],
      [edge("audio", "spectrum"), edge("audio", "waveform")]
    )
  }

  if (id === "orbit-pulse") {
    return makeGraph(
      [
        makeNode("audioSource", "audio", { x: 30, y: 70 }, {
          params: { feature: "bass", smoothing: 0.08 },
        }),
        makeNode("oscillator", "lfo", { x: 30, y: 330 }, {
          params: { rate: 0.18, waveform: "sine", depth: 1, offset: 0 },
        }),
        makeNode("mathCombine", "modulation", { x: 350, y: 190 }, {
          params: { op: "mul", scale: 1 },
        }),
        makeNode("particleField", "particles", { x: 670, y: 190 }, {
          params: { count: 1400, spread: 5, turbulence: 0.7, colorMode: "velocity" },
          palette: { color: "#a18aff", emissive: "#211142" },
          events: eventSettings({ beat: true, action: "burst", strength: 0.7 }),
        }),
        makeNode("background", "void", { x: 30, y: 470 }, {
          params: { style: "aurora", color: "#090817", skyTop: "#050512", horizonColor: "#281653", fogEnabled: true, fogColor: "#100b26", fogNear: 16, fogFar: 80 },
        }),
        makeNode("cameraRig", "orbit-camera", { x: 350, y: 470 }, {
          params: { posX: 0, posY: 2.4, posZ: 9, targetY: 0, fov: 54, orbitAmount: 0.32, orbitSpeed: 0.11, audioOrbit: 0.55, orbitFeature: "bass", shakeAmount: 0.06, shakeFeature: "beat", shakeSpeed: 11 },
        }),
        makeNode("lightingRig", "tide-lights", { x: 670, y: 470 }, {
          params: { preset: "neon", ambientIntensity: 0.22, keyIntensity: 0.48, keyColor: "#c7b8ff", fillIntensity: 0.52, fillColor: "#7a4cff", rimIntensity: 1.05, rimColor: "#4de5d2" },
        }),
      ],
      [
        edge("audio", "modulation", "a"),
        edge("lfo", "modulation", "b"),
        edge("modulation", "particles"),
      ]
    )
  }

  if (id === "neon-expressway") {
    return makeGraph(
      [
        makeNode("audioSource", "treble", { x: 20, y: 60 }, {
          params: { feature: "presence", smoothing: 0.1 },
        }),
        makeNode("bandAmplitude", "lift", { x: 260, y: 60 }, {
          params: { band: 5, gain: 1.6, offset: 0.03 },
        }),
        makeNode("pulseSphere", "moon", { x: 510, y: 60 }, {
          params: { radius: 1.2, band: 4, gain: 1.1, smoothing: 0.25, wireframe: true },
          palette: { color: "#d977ff", emissive: "#42104e" },
          transform: transform({ position: { x: 0, y: 1.3, z: 0 } }),
          events: eventSettings({ thresholdEnabled: true, thresholdFeature: "highMid", threshold: 0.72, action: "flash", strength: 0.5 }),
        }),
        makeNode("gridPlane", "road", { x: 510, y: 300 }, {
          params: { cellSize: 0.8, scrollSpeed: 0.16, waveAmount: 0.12, rippleAmount: 0.28, rippleSpeed: 1.6, rippleFrequency: 2.2, beatGlow: 1.1, glow: true },
          palette: { color: "#31e4d1", emissive: "#001a1a" },
          transform: transform({ position: { x: 0, y: -1.1, z: 0 } }),
        }),
        makeNode("cameraRig", "camera", { x: 20, y: 330 }, {
          params: { posX: 0, posY: 1.8, posZ: 9.5, targetY: 0, targetZ: -1, fov: 48, orbitAmount: 0.16, orbitSpeed: 0.16, audioOrbit: 0.18, orbitFeature: "high", shakeAmount: 0.045, shakeFeature: "onset", shakeSpeed: 17 },
        }),
        makeNode("background", "night", { x: 260, y: 330 }, {
          params: { style: "aurora", color: "#080b18", skyTop: "#050818", horizonColor: "#14253a", fogEnabled: true, fogColor: "#10102c", fogNear: 5, fogFar: 48 },
        }),
        makeNode("lightingRig", "lights", { x: 20, y: 510 }, {
          params: { preset: "neon", ambientIntensity: 0.28, keyIntensity: 0.9, fillIntensity: 0.55, rimIntensity: 1.4 },
        }),
      ],
      [edge("treble", "lift"), edge("lift", "moon")]
    )
  }

  if (id === "sleeve-study") {
    return makeGraph(
      [
        makeNode("audioSource", "breath", { x: 20, y: 80 }, {
          params: { feature: "onset", smoothing: 0.04 },
        }),
        makeNode("imagePlane", "cover", { x: 300, y: 80 }, {
          params: { size: 4.2, opacity: 0.94, treatment: "duotone", haloStrength: 0.56, audioScale: 0.035, revealOnset: true, revealDuration: 1.15 },
          transform: transform({ position: { x: 0, y: 0.45, z: 0 } }),
          events: eventSettings({ onset: true, action: "pulse", strength: 0.18, decaySeconds: 0.7 }),
        }),
        makeNode("textTitle", "title", { x: 570, y: 80 }, {
          params: { text: "A SIDE / B SIDE", size: 0.62, color: "#f3d5ad", depth: 0.1 },
          palette: { color: "#f3d5ad", emissive: "#4b3024" },
          transform: transform({ position: { x: 0, y: -2.05, z: 0.12 } }),
          events: eventSettings({ onset: true, action: "flash", strength: 0.4 }),
        }),
        makeNode("floorMirror", "stage", { x: 300, y: 330 }, {
          params: { size: 12, roughness: 0.32, shadowStrength: 0.24 },
          palette: { color: "#211b25", emissive: "#120b16" },
          transform: transform({ position: { x: 0, y: -2.8, z: 0 } }),
        }),
        makeNode("cameraRig", "camera", { x: 20, y: 340 }, {
          params: { posX: 0, posY: 0.2, posZ: 12, targetY: -0.2, fov: 42 },
        }),
        makeNode("background", "paper", { x: 570, y: 330 }, {
          params: { style: "gradient", color: "#17121a", skyTop: "#0c0b12", horizonColor: "#493039", fogEnabled: false },
        }),
        makeNode("lightingRig", "softbox", { x: 570, y: 500 }, {
          params: { preset: "sunset", ambientIntensity: 0.52, keyIntensity: 0.85, keyColor: "#ffdfc4", fillIntensity: 0.34, fillColor: "#c8879d", rimIntensity: 0.42, rimColor: "#f3d5ad" },
        }),
      ],
      [edge("breath", "title")]
    )
  }

  return makeGraph(
    [
      makeNode("audioSource", "meter", { x: 20, y: 50 }, {
        params: { feature: "rms", smoothing: 0.08 },
      }),
      makeNode("stepSequencer", "pattern", { x: 300, y: 300 }, {
        params: {
          count: 8,
          division: "1/8",
          pattern: [true, false, false, true, true, false, true, false],
          strength: 1.1,
        },
        palette: { color: "#ffc857", emissive: "#5c210f" },
      }),
      makeNode("textTitle", "marquee", { x: 300, y: 50 }, {
        params: { text: "NO QUIET PARTS", size: 0.68, color: "#ffc857", depth: 0 },
        palette: { color: "#ffc857", emissive: "#5c210f" },
        transform: transform({ position: { x: 0, y: 1.8, z: 0 } }),
        events: eventSettings({ beat: true, action: "flash", strength: 0.55 }),
      }),
      makeNode("radialRing", "spotlight", { x: 570, y: 170 }, {
          params: { ringCount: 2, baseRadius: 1.5, spin: -0.08, gain: 1.1, springStiffness: 54, springDamping: 3.2 },
        palette: { color: "#f45b69", emissive: "#44131b" },
        events: eventSettings({ beat: true, action: "pulse", strength: 0.6 }),
      }),
      makeNode("cameraRig", "camera", { x: 20, y: 320 }, {
        params: { posX: 0, posY: 2.6, posZ: 10, targetY: 0.3, fov: 48 },
      }),
      makeNode("background", "curtain", { x: 20, y: 500 }, {
          params: { style: "gradient", color: "#10131b", skyTop: "#070a12", horizonColor: "#401a2b", fogEnabled: true, fogColor: "#19121e", fogNear: 15, fogFar: 85 },
        }),
        makeNode("lightingRig", "marquee-lights", { x: 300, y: 500 }, {
          params: { preset: "cinematic", ambientIntensity: 0.3, keyIntensity: 0.92, keyColor: "#ffc857", fillIntensity: 0.3, fillColor: "#f45b69", rimIntensity: 0.9, rimColor: "#ffc857" },
      }),
    ],
    [edge("meter", "marquee")]
  )
}

function transform(
  update: Partial<NodeTransform>
): NodeTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    ...update,
  }
}
