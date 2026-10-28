/**
 * entry.ts — Web Worker entry point for the Sonic Genius Visual Render Worker.
 *
 * Runs on an OffscreenCanvas. Implements the full MainToWorker message protocol,
 * drives the Three.js render loop, extrapolates transport position, samples audio
 * features, and reports frame stats back to the main thread.
 *
 * This file must NOT import anything from React or Next.js.
 */

import * as THREE from "three"
import type { MainToWorker, WorkerToMain, SceneProgram } from "../types"
import { buildFeatureStore, sampleAt, type FeatureStore } from "../sampling"
import { SceneBuilder } from "./scene-builder"

// ---------------------------------------------------------------------------
// Transport state
// ---------------------------------------------------------------------------

type TransportState = {
  time: number
  playing: boolean
  rate: number
  duration: number
  /** performance.now() at the moment setTransport was received */
  receivedAt: number
}

// ---------------------------------------------------------------------------
// Worker-global state (set up on `init`)
// ---------------------------------------------------------------------------

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let sceneBuilder: SceneBuilder | null = null
let featureStore: FeatureStore | null = null

let transport: TransportState = {
  time: 0,
  playing: false,
  rate: 1,
  duration: 0,
  receivedAt: 0,
}

let lastPostedTime = 0

// The last size the main thread asked for, so a poster capture can restore it.
let renderWidth = 1
let renderHeight = 1
let renderDpr = 1

// FPS tracking
const FPS_WINDOW = 60
const fpsRing = new Float64Array(FPS_WINDOW)
let fpsHead = 0
let fpsCount = 0
let lastFrameTs = 0
let frameCount = 0
let droppedFrames = 0
let lastStatPost = 0

// rAF loop handle
let rafHandle: ReturnType<typeof setTimeout> | number | null = null
let workerRafSupported = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function post(msg: WorkerToMain, transfer?: Transferable[]): void {
  // OffscreenCanvas worker uses postMessage directly
  ;(self as unknown as Worker).postMessage(msg, transfer ?? [])
}

function postError(message: string, stack?: string, fatal = false): void {
  post({ type: "error", message, stack, fatal })
}

/**
 * Extrapolate current playback position from the last known transport state.
 */
function getCurrentTime(t: TransportState): number {
  if (!t.playing) return t.time
  const elapsed = ((performance.now() - t.receivedAt) / 1000) * t.rate
  const extrapolated = t.time + elapsed
  return Math.max(0, Math.min(t.duration, extrapolated))
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function tick(ts: number): void {
  try {
    renderFrame(ts)
  } catch (err) {
    stopLoop()
    postError(
      `Render loop failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err.stack : undefined,
      true
    )
  }
}

function renderFrame(ts: number): void {
  if (!renderer || !scene || !camera) return

  // Delta time (seconds), clamped to max 100 ms to avoid spiral-of-death
  const dt =
    lastFrameTs === 0 ? 1 / 60 : Math.min((ts - lastFrameTs) / 1000, 0.1)
  lastFrameTs = ts

  // Dropped frame counter
  if (dt > 0.05) droppedFrames++
  frameCount++

  // Rolling FPS
  if (lastFrameTs > 0 && dt > 0) {
    fpsRing[fpsHead % FPS_WINDOW] = 1 / dt
    fpsHead++
    fpsCount = Math.min(fpsCount + 1, FPS_WINDOW)
  }

  // --- Extrapolate transport time ---
  const currentTime = getCurrentTime(transport)

  // Snap check: if we've drifted more than 120 ms from last posted time, snap
  if (Math.abs(currentTime - lastPostedTime) > 0.12) {
    lastPostedTime = currentTime
  }

  // --- Sample features ---
  const features: Record<string, number> =
    featureStore && featureStore.frameCount > 0
      ? sampleAt(featureStore, currentTime)
      : emptyFeatures()

  // --- Update scene nodes ---
  if (sceneBuilder) {
    sceneBuilder.update(features, currentTime, dt, featureStore)
  }

  // --- Render ---
  renderer.render(scene, camera)

  // --- Post frame stats at ~2 Hz ---
  const now = performance.now()
  if (now - lastStatPost >= 500) {
    lastStatPost = now

    let avgFps = 0
    if (fpsCount > 0) {
      let sum = 0
      for (let i = 0; i < fpsCount; i++) sum += fpsRing[i]
      avgFps = sum / fpsCount
    }

    const info = renderer.info
    post({
      type: "frame",
      fps: Math.round(avgFps),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      droppedFrames,
    })
    // Reset dropped frame counter per reporting window
    droppedFrames = 0
  }

  // --- Schedule next frame ---
  scheduleNextFrame()
}

function scheduleNextFrame(): void {
  if (workerRafSupported) {
    rafHandle = requestAnimationFrame((ts) => tick(ts))
  } else {
    rafHandle = setTimeout(() => tick(performance.now()), 1000 / 60)
  }
}

function startLoop(): void {
  lastFrameTs = 0
  lastStatPost = performance.now()
  scheduleNextFrame()
}

function stopLoop(): void {
  if (rafHandle !== null) {
    if (workerRafSupported) {
      cancelAnimationFrame(rafHandle as number)
    } else {
      clearTimeout(rafHandle as ReturnType<typeof setTimeout>)
    }
    rafHandle = null
  }
}

function emptyFeatures(): Record<string, number> {
  return {
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    high: 0,
    presence: 0,
    brilliance: 0,
    air: 0,
    rms: 0,
    onset: 0,
    beat: 0,
    tempo: 0,
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handleInit(msg: Extract<MainToWorker, { type: "init" }>): void {
  const { canvas, width, height, dpr } = msg

  renderWidth = Math.max(1, width)
  renderHeight = Math.max(1, height)
  renderDpr = dpr

  // Three.js expects an HTMLCanvasElement-like style object on the canvas.
  const styleCanvas = canvas as unknown as {
    style?: Record<string, unknown>
  }
  if (!styleCanvas.style) styleCanvas.style = {}

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    renderer.info.autoReset = true
  } catch (err) {
    postError(
      `WebGLRenderer init failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err.stack : undefined,
      true
    )
    return
  }

  scene = new THREE.Scene()
  scene.background = new THREE.Color("#0a0a0a")

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.position.set(0, 3, 8)
  camera.lookAt(0, 0, 0)

  sceneBuilder = new SceneBuilder(scene)

  // A lost context cannot be restored in place. Tell the main thread so it can
  // show the reload affordance instead of leaving a frozen viewport.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault()
    postError("The WebGL context was lost", undefined, true)
    stopLoop()
  })

  // Detect capabilities
  const webgl2 = renderer.capabilities.isWebGL2
  const maxTextureSize = renderer.capabilities.maxTextureSize
  workerRafSupported =
    typeof (self as unknown as { requestAnimationFrame?: unknown })
      .requestAnimationFrame === "function"

  post({
    type: "ready",
    capabilities: { workerRaf: workerRafSupported, webgl2, maxTextureSize },
  })

  startLoop()
}

function handleSetScene(
  msg: Extract<MainToWorker, { type: "setScene" }>
): void {
  if (!sceneBuilder || !scene || !camera) return
  try {
    sceneBuilder.rebuild(msg.program, camera)
  } catch (err) {
    postError(
      `Scene rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err.stack : undefined,
      false
    )
  }
}

function handleSetFeatures(
  msg: Extract<MainToWorker, { type: "setFeatures" }>
): void {
  if (!msg.features) {
    featureStore = null
    return
  }

  try {
    featureStore = buildFeatureStore(msg.features)
  } catch (err) {
    postError(
      `buildFeatureStore failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err.stack : undefined,
      false
    )
  }
}

function handleSetTransport(
  msg: Extract<MainToWorker, { type: "setTransport" }>
): void {
  transport = {
    time: msg.time,
    playing: msg.playing,
    rate: msg.rate,
    duration: msg.duration,
    receivedAt: performance.now(),
  }
  lastPostedTime = msg.time
}

function handleResize(msg: Extract<MainToWorker, { type: "resize" }>): void {
  if (!renderer || !camera) return
  renderWidth = Math.max(1, msg.width)
  renderHeight = Math.max(1, msg.height)
  renderDpr = msg.dpr
  renderer.setPixelRatio(renderDpr)
  renderer.setSize(renderWidth, renderHeight, false)
  camera.aspect = renderWidth / renderHeight
  camera.updateProjectionMatrix()
}

/**
 * Render a poster still at an arbitrary size, transfer it as an ImageBitmap,
 * then restore the interactive viewport. The canvas is cleared by
 * transferToImageBitmap(), but the next animation frame repaints it.
 */
function handleCapture(msg: Extract<MainToWorker, { type: "capture" }>): void {
  if (!renderer || !scene || !camera) {
    postError("Cannot capture before the renderer is ready", undefined, false)
    return
  }

  const width = Math.max(16, Math.round(msg.width))
  const height = Math.max(16, Math.round(msg.height))
  const aspect = camera.aspect

  try {
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)

    const canvas = renderer.domElement as unknown as OffscreenCanvas
    const bitmap = canvas.transferToImageBitmap()
    post({ type: "captureResult", id: msg.id, bitmap }, [bitmap])
  } catch (err) {
    postError(
      `Poster capture failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err.stack : undefined,
      false
    )
  } finally {
    renderer.setPixelRatio(renderDpr)
    renderer.setSize(renderWidth, renderHeight, false)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }
}

function handlePick(msg: Extract<MainToWorker, { type: "pick" }>): void {
  if (!renderer || !scene || !camera || !sceneBuilder) {
    post({ type: "pickResult", nodeId: null })
    return
  }

  const { x, y } = msg

  // Get canvas size from renderer
  const size = renderer.getSize(new THREE.Vector2())
  // Normalise to NDC [-1, 1]
  const ndcX = (x / size.x) * 2 - 1
  const ndcY = -(y / size.y) * 2 + 1

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

  const intersects = raycaster.intersectObjects(scene.children, true)
  if (intersects.length === 0) {
    post({ type: "pickResult", nodeId: null })
    return
  }

  const hit = intersects[0].object
  const nodeId = sceneBuilder.resolveNodeId(hit)
  post({ type: "pickResult", nodeId })
}

function handleDispose(): void {
  stopLoop()

  if (sceneBuilder) {
    sceneBuilder.dispose()
    sceneBuilder = null
  }

  if (scene) {
    scene.clear()
    scene = null
  }

  if (renderer) {
    renderer.dispose()
    renderer = null
  }

  camera = null
  featureStore = null

  self.close()
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data
  try {
    switch (msg.type) {
      case "init":
        handleInit(msg)
        break
      case "setScene":
        handleSetScene(msg)
        break
      case "setFeatures":
        handleSetFeatures(msg)
        break
      case "setTransport":
        handleSetTransport(msg)
        break
      case "resize":
        handleResize(msg)
        break
      case "pick":
        handlePick(msg)
        break
      case "capture":
        handleCapture(msg)
        break
      case "dispose":
        handleDispose()
        break
      default:
        // Exhaustive check — TypeScript will warn about unhandled cases
        break
    }
  } catch (err) {
    postError(
      `Unhandled error in message handler "${(msg as { type: string }).type}": ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err.stack : undefined,
      msg.type === "init"
    )
  }
}
