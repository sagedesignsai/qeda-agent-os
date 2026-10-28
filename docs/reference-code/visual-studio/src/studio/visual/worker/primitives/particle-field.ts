/**
 * particle-field.ts — A floating particle cloud that animates with sin/cos noise.
 *
 * Particles are seeded in a sphere of radius `spread` and animated per-frame
 * using deterministic sin/cos displacement based on the particle index and time.
 * The RMS and bass features control the turbulence intensity.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

function seedFromString(value: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function createParticleField(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx
  const random = mulberry32(seedFromString(id))

  const count: number =
    typeof params.count === "number"
      ? Math.max(1, Math.round(params.count))
      : 2000
  const spread: number = typeof params.spread === "number" ? params.spread : 15
  const size: number = typeof params.size === "number" ? params.size : 0.05
  const turbulence: number =
    typeof params.turbulence === "number" ? params.turbulence : 0.5
  const colorMode: string =
    typeof params.colorMode === "string" ? params.colorMode : "velocity"

  const paletteColor = new THREE.Color(
    typeof params.color === "string" ? params.color : "#88ccff"
  )
  const paletteHsl = { h: 0, s: 0, l: 0 }
  paletteColor.getHSL(paletteHsl)

  // Seed positions randomly in a sphere
  const basePositions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Rejection sampling for uniform sphere distribution
    let x: number, y: number, z: number
    do {
      x = random() * 2 - 1
      y = random() * 2 - 1
      z = random() * 2 - 1
    } while (x * x + y * y + z * z > 1)
    basePositions[i * 3 + 0] = x * spread
    basePositions[i * 3 + 1] = y * spread
    basePositions[i * 3 + 2] = z * spread
  }

  const positions = new Float32Array(basePositions)
  const colors = new Float32Array(count * 3)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: colorMode !== "solid",
    color: colorMode === "solid" ? paletteColor : undefined,
    transparent: true,
    opacity: 0.85,
  })

  const points = new THREE.Points(geo, mat)

  // Phase offsets per particle for varied animation
  const phaseX = new Float32Array(count)
  const phaseY = new Float32Array(count)
  const phaseZ = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    phaseX[i] = random() * Math.PI * 2
    phaseY[i] = random() * Math.PI * 2
    phaseZ[i] = random() * Math.PI * 2
  }

  const tmpColor = new THREE.Color()

  function update(
    features: Record<string, number>,
    t: number,
    _dt: number,
    bound: number
  ): void {
    const rms = features["rms"] ?? 0
    const bass = features["bass"] ?? 0
    const high = features["high"] ?? 0

    const energy = rms * 0.5 + bass * 0.5
    // The bound feature drives the cloud's turbulence, so switching from bass
    // to rms/high changes the motion without rebuilding the geometry.
    const turbScale =
      turbulence * (1 + Math.min(2, Math.max(0, bound)) * 1.5 + energy * 0.5)

    const posAttr = geo.attributes["position"] as THREE.BufferAttribute
    const colAttr = geo.attributes["color"] as THREE.BufferAttribute

    for (let i = 0; i < count; i++) {
      const bx = basePositions[i * 3 + 0]
      const by = basePositions[i * 3 + 1]
      const bz = basePositions[i * 3 + 2]

      // Animated displacement
      const dx = Math.sin(t * 0.7 + phaseX[i]) * turbScale
      const dy = Math.cos(t * 0.5 + phaseY[i]) * turbScale
      const dz = Math.sin(t * 0.9 + phaseZ[i]) * turbScale

      posAttr.setXYZ(i, bx + dx, by + dy, bz + dz)

      if (colorMode !== "solid") {
        if (colorMode === "velocity") {
          // Color by displacement magnitude around the palette hue.
          const mag =
            Math.sqrt(dx * dx + dy * dy + dz * dz) / Math.max(turbScale, 1e-6)
          const hue = (paletteHsl.h + 0.55 - mag * 0.35 + 1) % 1
          tmpColor.setHSL(hue, 0.8, 0.4 + mag * 0.4)
        } else if (colorMode === "band") {
          // Color by y-position: low = bass tones, high = treble tones
          const norm = (by / spread) * 0.5 + 0.5 // 0..1
          const hue = (paletteHsl.h + norm * 0.35) % 1
          tmpColor.setHSL(hue, 0.7, 0.3 + high * 0.4)
        }
        colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
      }
    }

    posAttr.needsUpdate = true
    if (colorMode !== "solid") colAttr.needsUpdate = true

    // Size pulsing with energy
    mat.size = size * (1 + energy * 0.5)
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
  }

  return { id, kind: "particleField", update, dispose, object3D: points }
}
