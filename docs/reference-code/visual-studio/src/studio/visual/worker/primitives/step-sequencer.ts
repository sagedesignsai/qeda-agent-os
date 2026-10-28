/**
 * step-sequencer.ts — A rhythm-locked row of pads.
 *
 * The pattern is a boolean array stored in the node params. Step position is
 * derived deterministically from the transport time, the estimated tempo and
 * the chosen division, so scrubbing shows the same pad lighting up. The `beat`
 * feature supplies the flash envelope.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

const DIVISION_BEATS: Record<string, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
}

export function createStepSequencer(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const count =
    typeof params.count === "number"
      ? Math.min(16, Math.max(4, Math.round(params.count)))
      : 8
  const division = typeof params.division === "string" ? params.division : "1/8"
  const strength =
    typeof params.strength === "number" ? Math.max(0, params.strength) : 1
  const pattern = Array.isArray(params.pattern)
    ? (params.pattern as unknown[]).map((value) => value === true)
    : []

  const paletteColor = new THREE.Color(
    typeof params.color === "string" ? params.color : "#ffb000"
  )
  const emissiveColor = new THREE.Color(
    typeof params.emissive === "string" ? params.emissive : "#332200"
  )
  const flashColor = new THREE.Color("#ffffff")

  const group = new THREE.Group()
  const geometry = new THREE.BoxGeometry(0.32, 0.1, 0.32)
  const materials: THREE.MeshStandardMaterial[] = []
  const pads: THREE.Mesh[] = []

  const gap = 0.42
  const startX = -((count - 1) * gap) / 2

  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: paletteColor,
      emissive: emissiveColor,
      emissiveIntensity: 0.05,
      roughness: 0.35,
      metalness: 0.5,
    })
    materials.push(material)

    const pad = new THREE.Mesh(geometry, material)
    pad.position.set(startX + i * gap, 0, 0)
    pads.push(pad)
    group.add(pad)
  }

  let smoothedPulse = 0
  let lastStep = -1

  function update(
    features: Record<string, number>,
    t: number,
    dt: number,
    bound: number
  ): void {
    const bindingBoost = 0.6 + Math.min(1, Math.max(0, bound)) * 0.4
    const tempoBpm = Math.max(60, (features["tempo"] ?? 0) * 180 || 120)
    const stepDuration = (60 / tempoBpm) * (DIVISION_BEATS[division] ?? 0.5)
    const step = stepDuration > 0 ? Math.floor(t / stepDuration) % count : 0

    // The beat feature is a short 0/1 window; smooth it into a flash.
    const beat = features["beat"] ?? 0
    const onset = features["onset"] ?? 0
    const target = Math.max(beat, onset * 0.5)
    smoothedPulse += (target - smoothedPulse) * Math.min(1, dt * 18)

    if (step !== lastStep) lastStep = step

    for (let i = 0; i < count; i++) {
      const isActiveStep = i === step
      const inPattern = pattern.length > 0 ? pattern[i % pattern.length] : true
      const fired = isActiveStep && inPattern

      const lift = fired
        ? 0.08 + smoothedPulse * strength * bindingBoost * 0.22
        : 0.05
      const pad = pads[i]
      pad.scale.y = 0.6 + lift * 4
      pad.position.y = (pad.scale.y * 0.1) / 2

      const material = materials[i]
      const base = isActiveStep ? 0.35 : 0.06
      material.emissiveIntensity = fired
        ? base + smoothedPulse * strength
        : base
      if (fired) {
        material.color.copy(paletteColor).lerp(flashColor, smoothedPulse * 0.35)
      } else {
        material.color.copy(paletteColor)
      }
    }
  }

  function dispose(): void {
    geometry.dispose()
    for (const material of materials) material.dispose()
  }

  return { id, kind: "stepSequencer", update, dispose, object3D: group }
}
