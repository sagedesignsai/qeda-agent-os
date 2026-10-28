/**
 * pulse-sphere.ts — An icosahedron sphere that scales and glows with a frequency band.
 *
 * The sphere pulses (uniform scale) based on the selected band. It also rotates slowly
 * on all axes and its emissive intensity tracks the band energy.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

// Band index → FeatureName mapping
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

export function createPulseSphere(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const radius: number = typeof params.radius === "number" ? params.radius : 1.5
  const bandIndex: number =
    typeof params.band === "number"
      ? Math.min(7, Math.max(0, Math.round(params.band)))
      : 0
  const gain: number = typeof params.gain === "number" ? params.gain : 2
  const smoothing: number =
    typeof params.smoothing === "number" ? params.smoothing : 0.5
  const subdivisions: number =
    typeof params.subdivisions === "number"
      ? Math.min(5, Math.max(0, Math.round(params.subdivisions)))
      : 3
  const deformation =
    typeof params.deformation === "number"
      ? Math.min(0.75, Math.max(0, params.deformation))
      : 0.2
  const deformationWaves =
    typeof params.deformationWaves === "number"
      ? Math.min(12, Math.max(1, Math.round(params.deformationWaves)))
      : 4
  const wireframe: boolean =
    typeof params.wireframe === "boolean" ? params.wireframe : false

  const paletteColor = new THREE.Color(
    typeof params.color === "string" ? params.color : "#8833ff"
  )
  const emissiveColor = new THREE.Color(
    typeof params.emissive === "string" ? params.emissive : "#220066"
  )

  const bandName = BAND_FEATURES[bandIndex]

  const geo = new THREE.IcosahedronGeometry(radius, subdivisions)
  const position = geo.attributes["position"] as THREE.BufferAttribute
  const basePositions = new Float32Array(position.array)
  // Account for the maximum audio-driven displacement when frustum-culling.
  if (geo.boundingSphere) geo.boundingSphere.radius += deformation
  const mat = new THREE.MeshStandardMaterial({
    color: paletteColor,
    emissive: emissiveColor,
    emissiveIntensity: 0.3,
    roughness: wireframe ? 1 : 0.3,
    metalness: wireframe ? 0 : 0.7,
    wireframe,
  })

  const mesh = new THREE.Mesh(geo, mat)
  const pulseColor = new THREE.Color("#ffffff")

  // Smoothed scale value
  let smoothEnergy = 0

  function update(
    features: Record<string, number>,
    t: number,
    dt: number,
    bound: number
  ): void {
    const bindingFactor = 0.5 + Math.min(2, Math.max(0, bound)) * 0.5
    const raw = (features[bandName] ?? 0) * gain * bindingFactor
    const energy = Math.max(0, Math.min(2, raw))

    // One-pole smooth using the node's smoothing parameter
    const coefficient = 1 - Math.exp(-dt / (smoothing * 0.5 + 0.001))
    smoothEnergy += (energy - smoothEnergy) * coefficient

    // Scale pulse
    const scale = 1 + smoothEnergy * 0.4
    mesh.scale.setScalar(scale)

    // Displace vertices along their original radial direction. The audio
    // envelope controls the amplitude, so the sphere returns to its base shape
    // in silence without accumulating positional drift.
    if (deformation > 0 && smoothEnergy > 0.0001) {
      for (let i = 0; i < position.count; i++) {
        const offset = i * 3
        const x = basePositions[offset]
        const y = basePositions[offset + 1]
        const z = basePositions[offset + 2]
        const invLength = 1 / (Math.hypot(x, y, z) || 1)
        const nx = x * invLength
        const ny = y * invLength
        const nz = z * invLength
        const longitude = Math.atan2(nz, nx)
        const wave =
          Math.sin(longitude * deformationWaves + t * 1.7) *
          Math.cos(ny * deformationWaves * 1.4 - t * 1.1)
        const displacement = wave * smoothEnergy * deformation
        const radialScale = 1 + displacement * invLength
        position.setXYZ(i, x * radialScale, y * radialScale, z * radialScale)
      }
      position.needsUpdate = true
      geo.computeVertexNormals()
    } else if (deformation > 0) {
      position.array.set(basePositions)
      position.needsUpdate = true
      geo.computeVertexNormals()
    }

    // Gentle continuous rotation
    mesh.rotation.x += dt * 0.2
    mesh.rotation.y += dt * 0.3
    mesh.rotation.z += dt * 0.1

    // Emissive glow intensifies with energy
    mat.emissiveIntensity = 0.2 + smoothEnergy * 0.8

    // Color shift: dark to bright as energy rises
    mat.color.lerpColors(paletteColor, pulseColor, smoothEnergy * 0.3)
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { id, kind: "pulseSphere", update, dispose, object3D: mesh }
}
