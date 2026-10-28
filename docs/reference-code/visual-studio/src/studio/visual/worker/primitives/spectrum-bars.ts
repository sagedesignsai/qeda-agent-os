/**
 * spectrum-bars.ts — Frequency spectrum bar visualiser.
 *
 * Creates a row (or ring) of BoxGeometry meshes, one per bar. Each bar's Y-scale
 * is driven by the corresponding frequency band energy. Supports linear and radial
 * layouts, and gradient / solid / band color modes.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

// Named band features in order (indices 0..7)
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

export function createSpectrumBars(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const barCount: number =
    typeof params.bars === "number" ? Math.max(1, Math.round(params.bars)) : 16
  const gain: number = typeof params.gain === "number" ? params.gain : 1
  const maxHeight: number =
    typeof params.height === "number" ? params.height : 3
  const spacing: number =
    typeof params.spacing === "number" ? params.spacing : 0.05
  const layout: string =
    typeof params.layout === "string" ? params.layout : "linear"
  const colorMode: string =
    typeof params.colorMode === "string" ? params.colorMode : "gradient"

  // Color from node palette if available
  const paletteColor = new THREE.Color(
    typeof params.color === "string" ? params.color : "#4488ff"
  )
  const emissiveColor = new THREE.Color(
    typeof params.emissive === "string" ? params.emissive : "#001133"
  )

  // Bar dimensions: fixed width, unit height (we scale Y each frame)
  const barWidth = 0.4
  const barGeo = new THREE.BoxGeometry(barWidth, 1, barWidth)

  const group = new THREE.Group()

  const materials: THREE.MeshStandardMaterial[] = []
  const meshes: THREE.Mesh[] = []

  const totalWidth = barCount * (barWidth + spacing)
  const startX = -totalWidth / 2 + barWidth / 2

  for (let i = 0; i < barCount; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: paletteColor.clone(),
      emissive: emissiveColor.clone(),
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6,
    })
    materials.push(mat)

    const mesh = new THREE.Mesh(barGeo, mat)
    mesh.scale.y = 0.01 // start flat

    if (layout === "radial") {
      const angle = (i / barCount) * Math.PI * 2
      const radius = totalWidth / (2 * Math.PI)
      mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      mesh.rotation.y = -angle
    } else {
      // Linear layout along X
      mesh.position.set(startX + i * (barWidth + spacing), 0, 0)
    }

    meshes.push(mesh)
    group.add(mesh)
  }

  // Palette-derived helpers keep every colour mode responsive to the node
  // palette while preserving a visible energy gradient.
  const paletteHsl = { h: 0, s: 0, l: 0 }
  paletteColor.getHSL(paletteHsl)
  const colorLow = paletteColor.clone().multiplyScalar(0.22)
  const colorHigh = paletteColor.clone()
  const tmpColor = new THREE.Color()

  function update(
    features: Record<string, number>,
    _t: number,
    _dt: number,
    bound: number
  ): void {
    // The binding is a per-node envelope: changing it re-shapes the overall
    // response without hiding the individual bands in the spectrum.
    const bindingBoost = 0.7 + Math.min(2, Math.max(0, bound)) * 0.3

    for (let i = 0; i < barCount; i++) {
      // Map bar index → one of the 8 named bands (repeat if more bars than bands)
      const bandIdx = i % BAND_FEATURES.length
      const featureName = BAND_FEATURES[bandIdx]
      const raw = (features[featureName] ?? 0) * gain
      const energy = Math.max(0, Math.min(1, raw))

      // Scale mesh height
      const targetScaleY = Math.max(0.01, energy * maxHeight * bindingBoost)
      meshes[i].scale.y = targetScaleY
      // Align bottom of bar to y=0
      meshes[i].position.y = targetScaleY * 0.5

      // Color
      if (colorMode === "gradient") {
        tmpColor.lerpColors(colorLow, colorHigh, energy)
        materials[i].color.set(tmpColor)
        materials[i].emissiveIntensity = 0.2 + energy * 0.8
      } else if (colorMode === "band") {
        // Hue shifts across the frequency spectrum, anchored to the palette.
        const hue = (paletteHsl.h + (bandIdx / BAND_FEATURES.length) * 0.28) % 1
        materials[i].color.setHSL(hue, 0.8, 0.4 + energy * 0.4)
        materials[i].emissiveIntensity = energy * 0.5
      } else {
        // Solid: use palette color, vary emissive intensity
        materials[i].color.set(paletteColor)
        materials[i].emissiveIntensity = energy * 0.6
      }
    }
  }

  function dispose(): void {
    barGeo.dispose()
    for (const mat of materials) mat.dispose()
  }

  return { id, kind: "spectrumBars", update, dispose, object3D: group }
}
