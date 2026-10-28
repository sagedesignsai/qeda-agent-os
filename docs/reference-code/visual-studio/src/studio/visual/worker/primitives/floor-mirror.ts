/**
 * floor-mirror.ts — A glossy floor plane with a soft radial contact shadow.
 *
 * The reflection is approximated by a high-metalness MeshStandardMaterial lit
 * by the scene's directional light. The contact shadow is a canvas-generated
 * radial gradient; no render targets or post-processing are used in v1.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

const SHADOW_SIZE = 256

function createShadowTexture(): THREE.CanvasTexture {
  const canvas = new OffscreenCanvas(SHADOW_SIZE, SHADOW_SIZE)
  const context = canvas.getContext("2d")!

  context.clearRect(0, 0, SHADOW_SIZE, SHADOW_SIZE)
  const gradient = context.createRadialGradient(
    SHADOW_SIZE / 2,
    SHADOW_SIZE / 2,
    0,
    SHADOW_SIZE / 2,
    SHADOW_SIZE / 2,
    SHADOW_SIZE / 2
  )
  gradient.addColorStop(0, "rgba(0,0,0,0.85)")
  gradient.addColorStop(0.45, "rgba(0,0,0,0.45)")
  gradient.addColorStop(1, "rgba(0,0,0,0)")

  context.fillStyle = gradient
  context.fillRect(0, 0, SHADOW_SIZE, SHADOW_SIZE)

  return new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement)
}

export function createFloorMirror(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const size = typeof params.size === "number" ? Math.max(1, params.size) : 20
  const roughness =
    typeof params.roughness === "number"
      ? Math.min(1, Math.max(0, params.roughness))
      : 0.15
  const shadowStrength =
    typeof params.shadowStrength === "number"
      ? Math.min(1, Math.max(0, params.shadowStrength))
      : 0.5
  const paletteColor =
    typeof params.color === "string" ? params.color : "#111111"
  const emissiveColor =
    typeof params.emissive === "string" ? params.emissive : "#000000"

  const group = new THREE.Group()

  const floorGeometry = new THREE.PlaneGeometry(size, size)
  floorGeometry.rotateX(-Math.PI / 2)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: paletteColor,
    emissive: emissiveColor,
    metalness: 1,
    roughness,
    envMapIntensity: 0.4,
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  group.add(floor)

  const shadowGeometry = new THREE.PlaneGeometry(size * 0.55, size * 0.55)
  shadowGeometry.rotateX(-Math.PI / 2)
  const shadowTexture = createShadowTexture()
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: shadowStrength,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.position.y = 0.002
  group.add(shadow)

  function update(
    features: Record<string, number>,
    _t: number,
    _dt: number
  ): void {
    const energy = Math.min(
      1,
      (features["bass"] ?? 0) * 0.5 + (features["rms"] ?? 0) * 0.5
    )
    floorMaterial.roughness = Math.max(0.02, roughness - energy * 0.08)
    shadowMaterial.opacity = shadowStrength * (0.85 + energy * 0.15)
  }

  function dispose(): void {
    floorGeometry.dispose()
    floorMaterial.dispose()
    shadowGeometry.dispose()
    shadowMaterial.dispose()
    shadowTexture.dispose()
  }

  return { id, kind: "floorMirror", update, dispose, object3D: group }
}
