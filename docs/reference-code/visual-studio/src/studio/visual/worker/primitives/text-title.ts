/**
 * text-title.ts — Canvas-textured 2D text billboard.
 *
 * Renders text onto a 512×128 OffscreenCanvas and maps it onto a PlaneGeometry.
 * Opacity and glow follow the node's bound feature, with an onset transient.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

const CANVAS_W = 512
const CANVAS_H = 128

export function createTextTitle(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const text: string = typeof params.text === "string" ? params.text : "SONIC"
  const size: number = typeof params.size === "number" ? params.size : 2
  const color: string =
    typeof params.color === "string" ? params.color : "#ffffff"
  const depth: number = typeof params.depth === "number" ? params.depth : 0

  // ---------------------------------------------------------------------------
  // Build canvas texture
  // ---------------------------------------------------------------------------
  const offscreen = new OffscreenCanvas(CANVAS_W, CANVAS_H)
  const octx = offscreen.getContext("2d")!

  function drawText(glowIntensity: number): void {
    octx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Transparent background
    octx.fillStyle = "rgba(0,0,0,0)"
    octx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Glow
    if (glowIntensity > 0.01) {
      octx.shadowBlur = 20 * glowIntensity
      octx.shadowColor = color
    } else {
      octx.shadowBlur = 0
    }

    // Text
    const fontSize = Math.round(CANVAS_H * 0.65)
    octx.font = `bold ${fontSize}px "Arial Black", Arial, sans-serif`
    octx.fillStyle = color
    octx.textAlign = "center"
    octx.textBaseline = "middle"
    octx.fillText(text, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W - 20)
    octx.shadowBlur = 0
  }

  // Initial draw
  drawText(0)

  const texture = new THREE.CanvasTexture(
    offscreen as unknown as HTMLCanvasElement
  )
  texture.needsUpdate = true

  // Aspect ratio of the canvas
  const aspect = CANVAS_W / CANVAS_H

  const geo = new THREE.PlaneGeometry(size * aspect, size)
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.z = depth

  // Base opacity param
  const baseOpacity: number =
    typeof params.opacity === "number"
      ? Math.min(1, Math.max(0, params.opacity))
      : 1

  let smoothOnset = 0
  let lastDrawnGlow = -1
  let lastDrawAt = 0

  function update(
    features: Record<string, number>,
    _t: number,
    dt: number,
    bound: number
  ): void {
    const onset = features["onset"] ?? 0
    const boundClamped = Math.min(1, Math.max(0, bound))

    // The bound feature drives the glow/opacity envelope; onset stays as a
    // fast transient so beat-bound titles still flash.
    const glowTarget = Math.max(onset * 0.6, boundClamped)
    smoothOnset += (glowTarget - smoothOnset) * Math.min(dt * 15, 1)

    // Canvas text is expensive compared with opacity. Only repaint when the
    // glow has changed enough, and never more than roughly 12 times a second.
    const now = performance.now()
    if (Math.abs(smoothOnset - lastDrawnGlow) > 0.02 && now - lastDrawAt > 80) {
      drawText(smoothOnset)
      texture.needsUpdate = true
      lastDrawnGlow = smoothOnset
      lastDrawAt = now
    }

    // Opacity follows the bound envelope, with a small onset flash.
    mat.opacity = baseOpacity * (0.65 + boundClamped * 0.3 + onset * 0.05)
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
    texture.dispose()
  }

  return { id, kind: "textTitle", update, dispose, object3D: mesh }
}
