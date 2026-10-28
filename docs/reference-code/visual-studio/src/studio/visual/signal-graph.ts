import type { SceneProgramNode } from "./types"

type SignalEdge = {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

type SignalNode = Pick<SceneProgramNode, "id" | "kind" | "params" | "binding">

export type SignalEvaluator = {
  evaluate: (
    features: Record<string, number>,
    time: number,
    dt: number
  ) => Map<string, number>
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const BAND_FEATURES = [
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "high",
  "presence",
  "brilliance",
  "air",
] as const

function orderNodes(nodes: SignalNode[], edges: SignalEdge[]): SignalNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map<string, string[]>()

  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    const targets = outgoing.get(edge.source) ?? []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }

  const ready = nodes.filter((node) => incoming.get(node.id) === 0)
  const ordered: SignalNode[] = []
  while (ready.length) {
    const node = ready.shift()!
    ordered.push(node)
    for (const target of outgoing.get(node.id) ?? []) {
      const count = (incoming.get(target) ?? 0) - 1
      incoming.set(target, count)
      if (count === 0) {
        const next = byId.get(target)
        if (next) ready.push(next)
      }
    }
  }

  // A malformed legacy graph should not prevent the scene from rendering.
  if (ordered.length !== nodes.length) {
    const included = new Set(ordered.map((node) => node.id))
    ordered.push(...nodes.filter((node) => !included.has(node.id)))
  }

  return ordered
}

function oscillatorValue(node: SignalNode, time: number): number {
  const rate = Number(node.params.rate ?? 1)
  const phase = Number(node.params.phase ?? 0)
  const depth = Number(node.params.depth ?? 1)
  const offset = Number(node.params.offset ?? 0)
  const cycle = ((time * rate + phase) % 1 + 1) % 1
  const wave = node.params.waveform

  let value: number
  if (wave === "square") value = cycle < 0.5 ? 1 : 0
  else if (wave === "saw") value = cycle
  else if (wave === "tri") value = 1 - Math.abs(cycle * 2 - 1)
  else value = (Math.sin(cycle * Math.PI * 2) + 1) / 2

  return clamp01(offset + value * depth)
}

export function createSignalEvaluator(
  nodes: SignalNode[],
  edges: SignalEdge[]
): SignalEvaluator {
  const ordered = orderNodes(nodes, edges)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const envelopeValues = new Map<string, number>()
  const sourceSmoothing = new Map<string, number>()
  let previousTime: number | null = null

  return {
    evaluate(features, time, dt) {
      // Reset temporal modifiers on seeks or large playback gaps. This avoids
      // carrying an envelope from an unrelated part of the track into a seek.
      if (
        previousTime !== null &&
        (time < previousTime || time - previousTime > 0.25)
      ) {
        envelopeValues.clear()
        sourceSmoothing.clear()
      }
      previousTime = time

      const values = new Map<string, number>()
      const incoming = (nodeId: string, handle: string) => {
        const edge = edges.find(
          (candidate) =>
            candidate.target === nodeId &&
            (candidate.targetHandle ?? "in") === handle
        )
        return edge ? values.get(edge.source) : undefined
      }
      const rawFeature = (node: SignalNode) => {
        if (node.kind === "bandAmplitude") {
          const band = Math.min(
            BAND_FEATURES.length - 1,
            Math.max(0, Math.round(Number(node.params.band ?? 0)))
          )
          return features[BAND_FEATURES[band]] ?? 0
        }
        return features[node.binding.feature] ?? 0
      }

      for (const node of ordered) {
        let value = 0
        switch (node.kind) {
          case "audioSource": {
            const feature = String(node.params.feature ?? "rms")
            const target = features[feature] ?? 0
            const smoothing = Math.min(
              1,
              Math.max(0, Number(node.params.smoothing ?? 0))
            )
            const previous = sourceSmoothing.get(node.id) ?? target
            const coefficient = 1 - Math.exp(-Math.max(0, dt) / (smoothing * 0.5 + 0.001))
            value = previous + (target - previous) * coefficient
            sourceSmoothing.set(node.id, value)
            break
          }
          case "bandAmplitude": {
            const input = incoming(node.id, "in") ?? rawFeature(node)
            value = clamp01(
              input * Number(node.params.gain ?? 1) +
                Number(node.params.offset ?? 0)
            )
            break
          }
          case "envelopeFollower": {
            const input = incoming(node.id, "in") ?? rawFeature(node)
            const previous = envelopeValues.get(node.id) ?? input
            const timeConstant =
              input > previous
                ? Number(node.params.attack ?? 0.01)
                : Number(node.params.release ?? 0.1)
            const coefficient =
              1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, timeConstant))
            value = clamp01(previous + (input - previous) * coefficient)
            envelopeValues.set(node.id, value)
            break
          }
          case "oscillator":
            value = oscillatorValue(node, time)
            break
          case "mathCombine": {
            const a = incoming(node.id, "a") ?? 0
            const b = incoming(node.id, "b") ?? 0
            const operation = node.params.op
            let result = a + b
            if (operation === "mul") result = a * b
            else if (operation === "sub") result = a - b
            else if (operation === "max") result = Math.max(a, b)
            else if (operation === "min") result = Math.min(a, b)
            value = clamp01(result * Number(node.params.scale ?? 1))
            break
          }
          default: {
            const input = incoming(node.id, "in")
            value = input ?? rawFeature(node)
            break
          }
        }
        values.set(node.id, clamp01(Number.isFinite(value) ? value : 0))
      }

      // Keep this reference read explicit: nodes omitted from a program must
      // never become accidental signal sources through stale edges.
      for (const id of values.keys()) {
        if (!byId.has(id)) values.delete(id)
      }
      return values
    },
  }
}
