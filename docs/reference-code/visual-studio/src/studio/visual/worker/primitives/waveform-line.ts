/**
 * waveform-line.ts — A 3D sine-wave line modulated by audio RMS.
 *
 * Renders a horizontal THREE.Line whose Y positions are animated with a sine wave
 * scaled by the node's bound feature. Supports rainbow, energy, and solid modes.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

export function createWaveformLine(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const samples: number =
    typeof params.samples === "number"
      ? Math.max(2, Math.round(params.samples))
      : 256
  const amplitude: number =
    typeof params.amplitude === "number" ? params.amplitude : 2
  const colorMode: string =
    typeof params.colorMode === "string" ? params.colorMode : "rainbow"
  const phase: number = typeof params.phase === "number" ? params.phase : 0

  const paletteColor = new THREE.Color(
    typeof params.color === "string" ? params.color : "#00ffaa"
  )
  const paletteHsl = { h: 0, s: 0, l: 0 }
  paletteColor.getHSL(paletteHsl)

  // Line spans from -samples/2 to +samples/2 in world units (normalised to -5..+5)
  const lineHalfWidth = 5

  const positions = new Float32Array(samples * 3)
  const colors = new Float32Array(samples * 3)

  // Initialise positions flat along X
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1) // 0..1
    positions[i * 3 + 0] = (t - 0.5) * lineHalfWidth * 2
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = 0
    colors[i * 3 + 0] = paletteColor.r
    colors[i * 3 + 1] = paletteColor.g
    colors[i * 3 + 2] = paletteColor.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.LineBasicMaterial({
    vertexColors: colorMode !== "solid",
    color: colorMode === "solid" ? paletteColor : undefined,
    linewidth: 1, // WebGL ignores values > 1, but set for completeness
  })

  const line = new THREE.Line(geo, mat)

  const tmpColor = new THREE.Color()

  function update(
    features: Record<string, number>,
    t: number,
    _dt: number,
    bound: number
  ): void {
    const onset = features["onset"] ?? 0
    const high = features["high"] ?? 0
    const bass = features["bass"] ?? 0

    // The bound feature drives the amplitude envelope; onset adds a little
    // transient attack on top regardless of which feature is selected.
    const energy = Math.min(2, Math.max(0, bound) + onset * 0.15)

    const posAttr = geo.attributes["position"] as THREE.BufferAttribute
    const colAttr = geo.attributes["color"] as THREE.BufferAttribute

    for (let i = 0; i < samples; i++) {
      const norm = i / (samples - 1) // 0..1

      // Primary sine wave modulated by the bound envelope
      const y =
        Math.sin(norm * Math.PI * 2 + t * 2 + phase * Math.PI * 2) *
        energy *
        amplitude

      posAttr.setY(i, y)

      if (colorMode !== "solid") {
        if (colorMode === "rainbow") {
          // Hue cycles along the line, anchored to the palette hue.
          const hue = (paletteHsl.h + norm * 0.35 + t * 0.1) % 1
          tmpColor.setHSL(hue, 0.9, 0.5)
        } else if (colorMode === "energy") {
          // Tint the full waveform from the palette, brightening with height.
          const absY = Math.abs(y) / Math.max(amplitude, 0.01)
          const treble = high * norm + bass * (1 - norm)
          tmpColor
            .copy(paletteColor)
            .offsetHSL(treble * 0.18, 0, 0.2 + absY * 0.3)
        }
        colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
      }
    }

    posAttr.needsUpdate = true
    if (colorMode !== "solid") colAttr.needsUpdate = true
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { id, kind: "waveformLine", update, dispose, object3D: line }
}
