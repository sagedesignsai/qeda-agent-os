/**
 * radial-ring.ts — Concentric torus rings that pulse with bass and spin.
 *
 * Creates `ringCount` TorusGeometry meshes at increasing radii.
 * Each ring independently pulses by scaling based on a frequency band,
 * and rotates continuously at `spin` rad/s.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"
import { stepSpring } from "../../motion"

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

export function createRadialRing(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const ringCount: number =
    typeof params.ringCount === "number"
      ? Math.max(1, Math.round(params.ringCount))
      : 2
  const baseRadius: number =
    typeof params.baseRadius === "number" ? params.baseRadius : 2
  const thickness: number =
    typeof params.thickness === "number" ? params.thickness : 0.05
  const bandIndex: number =
    typeof params.band === "number"
      ? Math.min(7, Math.max(0, Math.round(params.band)))
      : 0
  const gain: number = typeof params.gain === "number" ? params.gain : 1.5
  const smoothing: number =
    typeof params.smoothing === "number" ? params.smoothing : 0.5
  const spin: number = typeof params.spin === "number" ? params.spin : 0.2
  const springStiffness =
    typeof params.springStiffness === "number" ? params.springStiffness : 32
  const springDamping =
    typeof params.springDamping === "number" ? params.springDamping : 4

  const paletteColor = new THREE.Color(
    typeof params.color === "string" ? params.color : "#00aaff"
  )
  const emissiveColor = new THREE.Color(
    typeof params.emissive === "string" ? params.emissive : "#004488"
  )

  const bandName = BAND_FEATURES[bandIndex]

  const group = new THREE.Group()
  const toruses: THREE.Mesh[] = []
  const materials: THREE.MeshStandardMaterial[] = []
  const geometries: THREE.TorusGeometry[] = []

  for (let i = 0; i < ringCount; i++) {
    // Radii increase for outer rings
    const r = baseRadius * (1 + i * 0.5)
    const geo = new THREE.TorusGeometry(r, thickness, 16, 100)
    geometries.push(geo)

    // Slight hue shift per ring
    const hue = (i / Math.max(ringCount - 1, 1)) * 0.3
    const mat = new THREE.MeshStandardMaterial({
      color: paletteColor.clone().offsetHSL(hue, 0, 0),
      emissive: emissiveColor.clone(),
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 1 - i * (0.2 / Math.max(ringCount, 2)),
    })
    materials.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    // Tilt rings slightly differently for visual depth
    mesh.rotation.x = Math.PI / 2 + i * 0.1
    toruses.push(mesh)
    group.add(mesh)
  }

  // Smoothed scale value
  let springScale = 1
  let springVelocity = 0

  function update(
    features: Record<string, number>,
    _t: number,
    dt: number,
    bound: number
  ): void {
    const bindingFactor = 0.5 + Math.min(2, Math.max(0, bound)) * 0.5
    const raw = (features[bandName] ?? 0) * gain * bindingFactor
    const energy = Math.max(0, Math.min(2, raw))

    // Smooth the scale using the node's smoothing parameter
    const targetScale = 1 + energy * 0.5
    // Keep the legacy smoothing control useful as an additional response
    // softness multiplier while the spring supplies overshoot and rebound.
    const effectiveStiffness = springStiffness * (1.5 - smoothing)
    const spring = stepSpring(
      springScale,
      springVelocity,
      targetScale,
      effectiveStiffness,
      springDamping,
      dt
    )
    springScale = Math.min(2.5, Math.max(0.5, spring.value))
    springVelocity = springScale === spring.value ? spring.velocity : 0

    for (let i = 0; i < ringCount; i++) {
      const mesh = toruses[i]

      // Scale: outer rings react slightly less
      const ringScale = springScale * (1 - i * (0.1 / Math.max(ringCount, 2)))
      mesh.scale.setScalar(Math.max(0.1, ringScale))

      // Spin: alternate direction for inner/outer rings
      const dir = i % 2 === 0 ? 1 : -1
      mesh.rotation.z += spin * dt * dir

      // Emissive pulse
      materials[i].emissiveIntensity = 0.3 + energy * 0.7
    }
  }

  function dispose(): void {
    for (const geo of geometries) geo.dispose()
    for (const mat of materials) mat.dispose()
  }

  return { id, kind: "radialRing", update, dispose, object3D: group }
}
