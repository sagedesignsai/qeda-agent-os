/**
 * grid-plane.ts — Retro-futuristic scrolling grid floor.
 *
 * Uses a PlaneGeometry with a CanvasTexture (512×512 OffscreenCanvas) that draws
 * a grid pattern. The canvas is redrawn every frame with an animated Y offset to
 * create a scrolling illusion. Wave deformation pulses the mesh vertices with bass.
 *
 * This avoids the need for custom GLSL shaders.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

const CANVAS_SIZE = 512
const GRID_DIVISIONS = 20 // lines per canvas side

export function createGridPlane(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const cellSize: number =
    typeof params.cellSize === "number" ? params.cellSize : 1
  const lineColor: string =
    typeof params.lineColor === "string" ? params.lineColor : "#00ffff"
  const glow: boolean = typeof params.glow === "boolean" ? params.glow : true
  const scrollSpeed: number =
    typeof params.scrollSpeed === "number" ? params.scrollSpeed : 1
  const waveAmount: number =
    typeof params.waveAmount === "number" ? params.waveAmount : 0.3
  const rippleAmount =
    typeof params.rippleAmount === "number" ? params.rippleAmount : 0.35
  const rippleSpeed =
    typeof params.rippleSpeed === "number" ? params.rippleSpeed : 2.2
  const rippleFrequency =
    typeof params.rippleFrequency === "number" ? params.rippleFrequency : 1.8
  const beatGlow = typeof params.beatGlow === "number" ? params.beatGlow : 0.8
  const baseColor = new THREE.Color(0xffffff)
  const rippleEnergy = new THREE.Color(lineColor)

  // How many world units the plane spans
  const planeSize = GRID_DIVISIONS * cellSize

  // ---------------------------------------------------------------------------
  // OffscreenCanvas texture
  // ---------------------------------------------------------------------------
  const offscreen = new OffscreenCanvas(CANVAS_SIZE, CANVAS_SIZE)
  const octx = offscreen.getContext("2d")!

  const texture = new THREE.CanvasTexture(
    offscreen as unknown as HTMLCanvasElement
  )
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping

  let scrollOffset = 0

  function redrawCanvas(energy: number): void {
    const cellPx = CANVAS_SIZE / GRID_DIVISIONS

    octx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Background fill — dark
    octx.fillStyle = "#050510"
    octx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Glow shadow effect
    octx.shadowBlur = glow ? 8 + energy * 12 : 0
    octx.shadowColor = lineColor
    octx.strokeStyle = lineColor
    octx.lineWidth = glow ? 1.5 : 1

    // Y-scrolling offset in pixels
    const yOff = ((scrollOffset % cellPx) + cellPx) % cellPx

    // Vertical lines
    for (let col = 0; col <= GRID_DIVISIONS; col++) {
      const x = col * cellPx
      octx.beginPath()
      octx.moveTo(x, 0)
      octx.lineTo(x, CANVAS_SIZE)
      octx.stroke()
    }

    // Horizontal lines (scrolling)
    for (let row = -1; row <= GRID_DIVISIONS + 1; row++) {
      const y = row * cellPx + yOff
      octx.beginPath()
      octx.moveTo(0, y)
      octx.lineTo(CANVAS_SIZE, y)
      octx.stroke()
    }

    octx.shadowBlur = 0
    texture.needsUpdate = true
  }

  // ---------------------------------------------------------------------------
  // Plane geometry — use enough segments to allow wave deformation
  // ---------------------------------------------------------------------------
  const segments = 40
  const geo = new THREE.PlaneGeometry(planeSize, planeSize, segments, segments)
  // Rotate flat on floor (XZ plane)
  geo.rotateX(-Math.PI / 2)

  // Cache original Y positions for wave animation
  const posAttr = geo.attributes["position"] as THREE.BufferAttribute
  const originalY = new Float32Array(posAttr.count)
  for (let i = 0; i < posAttr.count; i++) {
    originalY[i] = posAttr.getY(i)
  }

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  })
  let beatEnvelope = 0

  const mesh = new THREE.Mesh(geo, mat)

  // Paint the grid once. Scroll and energy are applied by offsetting the
  // repeating texture and displacing vertices, which keeps the per-frame cost
  // to a texture offset rather than a full 512×512 canvas repaint.
  redrawCanvas(0)

  function update(
    features: Record<string, number>,
    t: number,
    dt: number,
    bound: number
  ): void {
    const bass = features["bass"] ?? 0
    const rms = features["rms"] ?? 0
    const energy = bass * 0.7 + rms * 0.3
    const beat = Math.min(1, Math.max(0, features["beat"] ?? 0))
    const beatCoefficient =
      1 - Math.exp(-dt / (beat > beatEnvelope ? 0.025 : 0.24))
    beatEnvelope += (beat - beatEnvelope) * beatCoefficient
    mat.color.copy(baseColor).lerp(rippleEnergy, beatEnvelope * beatGlow * 0.25)
    mat.color.multiplyScalar(1 + beatEnvelope * beatGlow)

    // Scroll the Y offset. One texture repeat contains GRID_DIVISIONS cells,
    // so the param is expressed in cells per second.
    scrollOffset += (scrollSpeed * dt) / GRID_DIVISIONS
    texture.offset.y = scrollOffset % 1

    // Wave deformation on the plane vertices. Always write, so the mesh
    // settles back when the energy drops. The node's bound feature controls
    // the wave envelope alongside the mixed band energy.
    const wave =
      (energy * 0.5 + Math.min(2, Math.max(0, bound)) * 0.5) * waveAmount
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i)
      const z = posAttr.getZ(i)
      const distance = Math.hypot(x, z)
      const travelingRipple =
        Math.sin(distance * rippleFrequency - t * rippleSpeed) *
        rippleAmount *
        Math.max(energy, Math.min(1, Math.max(0, bound))) *
        Math.exp(-distance * 0.035)
      const y =
        originalY[i] +
        Math.sin(x * 0.5 + t * 2) * wave +
        Math.cos(z * 0.5 + t * 1.5) * wave +
        travelingRipple
      posAttr.setY(i, y)
    }
    posAttr.needsUpdate = true
  }

  function dispose(): void {
    geo.dispose()
    mat.dispose()
    texture.dispose()
  }

  return { id, kind: "gridPlane", update, dispose, object3D: mesh }
}
