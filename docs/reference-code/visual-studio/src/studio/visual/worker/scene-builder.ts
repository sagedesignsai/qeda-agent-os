/**
 * scene-builder.ts — Builds and manages the Three.js scene from a SceneProgram.
 *
 * Translates a compiled SceneProgram into live Three.js objects by looking up
 * each node's kind in the PRIMITIVE_REGISTRY and calling its factory function.
 */

import type { LightingPreset, SceneProgram, SceneProgramNode } from "../types"
import { THREE } from "./three-imports"
import { PRIMITIVE_REGISTRY } from "./primitives/registry"
import { createSignalEvaluator, type SignalEvaluator } from "../signal-graph"
import { evaluateVisualEvent } from "../events"
import type { FeatureStore } from "../sampling"

// ---------------------------------------------------------------------------
// NodeInstance — the live runtime representation of a SceneProgramNode
// ---------------------------------------------------------------------------

export type NodeInstance = {
  id: string
  kind: string
  /**
   * Called every frame with sampled feature values, current time, delta time,
   * and the node's gain- and smoothing-adjusted bound feature value.
   */
  update: (
    features: Record<string, number>,
    t: number,
    dt: number,
    bound: number
  ) => void
  /** Release all GPU resources */
  dispose: () => void
  /** The root Three.js object for this node (may be a Group) */
  object3D: THREE.Object3D
}

type BindingState = {
  feature: string
  gain: number
  smoothing: number
  value: number
}

// ---------------------------------------------------------------------------
// SceneBuilder
// ---------------------------------------------------------------------------

export class SceneBuilder {
  private scene: THREE.Scene
  private instances: Map<string, NodeInstance> = new Map()
  private nodeRoots = new Map<string, THREE.Group>()
  private bindings: Map<string, BindingState> = new Map()
  private signalEvaluator: SignalEvaluator | null = null
  private connectedVisualInputs = new Set<string>()
  private eventLights = new Map<string, THREE.PointLight>()
  private baseScales = new Map<string, [number, number, number]>()
  private programNodes = new Map<string, SceneProgramNode>()
  private markers: SceneProgram["markers"] = []
  private camera: THREE.PerspectiveCamera | null = null
  private cameraSettings: SceneProgram["camera"] | null = null
  private cameraTarget = new THREE.Vector3()
  private cameraOrbitEnergy = 0
  private cameraShakeEnergy = 0
  private skyMesh: THREE.Mesh | null = null
  private skyGeometry: THREE.SphereGeometry | null = null
  private skyMaterial: THREE.ShaderMaterial | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Tear down all existing instances and rebuild from a new SceneProgram.
   * `camera` is passed so the builder can update its position/target/fov.
   */
  rebuild(program: SceneProgram, camera: THREE.PerspectiveCamera): void {
    // --- Dispose all existing instances ---
    for (const inst of this.instances.values()) {
      const root = this.nodeRoots.get(inst.id) ?? inst.object3D
      this.scene.remove(root)
      inst.dispose()
    }
    this.instances.clear()
    this.nodeRoots.clear()
    this.bindings.clear()
    this.connectedVisualInputs.clear()
    this.eventLights.clear()
    this.baseScales.clear()
    this.programNodes = new Map(program.nodes.map((node) => [node.id, node]))
    this.markers = program.markers
    this.signalEvaluator = createSignalEvaluator(program.nodes, program.edges)
    for (const edge of program.edges) {
      if ((edge.targetHandle ?? "in") === "in") {
        this.connectedVisualInputs.add(edge.target)
      }
    }
    this.camera = camera
    this.cameraSettings = program.camera
    this.cameraTarget.set(...program.camera.target)
    this.cameraOrbitEnergy = 0
    this.cameraShakeEnergy = 0

    // --- Rebuild scene lighting ---
    const existing = this.scene.children.filter(
      (c) =>
        c instanceof THREE.AmbientLight || c instanceof THREE.DirectionalLight
    )
    for (const l of existing) this.scene.remove(l)
    this.applyLighting(program.lighting)

    // --- Build each node ---
    for (const node of program.nodes) {
      this.buildNode(node)
    }

    // --- Update camera ---
    if (program.camera) {
      const { position, target, fov } = program.camera
      camera.position.set(...position)
      camera.fov = fov
      camera.updateProjectionMatrix()
      // Store the target as lookAt — we apply it after position is set
      camera.lookAt(new THREE.Vector3(...target))
    }

    this.applyEnvironment(program.environment)
  }

  private applyLighting(lighting: SceneProgram["lighting"]): void {
    const profiles: Record<LightingPreset, [number, number, number, number]> = {
      balanced: [1, 1, 1, 1],
      cinematic: [0.45, 1.25, 0.5, 1.45],
      neon: [0.38, 0.7, 1.2, 1.7],
      sunset: [0.85, 1.15, 0.75, 0.45],
    }
    const [ambientScale, keyScale, fillScale, rimScale] =
      profiles[lighting.preset] ?? profiles.balanced
    const ambient = new THREE.AmbientLight(
      0xffffff,
      lighting.ambientIntensity * ambientScale
    )
    const key = new THREE.DirectionalLight(
      lighting.keyColor,
      lighting.keyIntensity * keyScale
    )
    const fill = new THREE.DirectionalLight(
      lighting.fillColor,
      lighting.fillIntensity * fillScale
    )
    const rim = new THREE.DirectionalLight(
      lighting.rimColor,
      lighting.rimIntensity * rimScale
    )

    key.position.set(5, 8, 6)
    fill.position.set(-6, 3, 4)
    rim.position.set(-1, 6, -7)
    this.scene.add(ambient, key, fill, rim)
  }

  private applyEnvironment(
    environment: SceneProgram["environment"]
  ): void {
    if (this.skyMesh) this.scene.remove(this.skyMesh)
    this.skyGeometry?.dispose()
    this.skyMaterial?.dispose()
    this.skyMesh = null
    this.skyGeometry = null
    this.skyMaterial = null

    if (environment.style === "solid") {
      this.scene.background = new THREE.Color(environment.background)
    } else {
      this.scene.background = new THREE.Color("#000000")
      this.skyGeometry = new THREE.SphereGeometry(500, 48, 32)
      this.skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uBottomColor: { value: new THREE.Color(environment.background) },
          uHorizonColor: { value: new THREE.Color(environment.horizonColor) },
          uTopColor: { value: new THREE.Color(environment.skyTop) },
          uStyle: { value: environment.style === "aurora" ? 1 : 0 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vSkyDirection;
          void main() {
            vSkyDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uBottomColor;
          uniform vec3 uHorizonColor;
          uniform vec3 uTopColor;
          uniform float uStyle;
          uniform float uTime;
          varying vec3 vSkyDirection;
          void main() {
            float height = normalize(vSkyDirection).y;
            vec3 sky = mix(uBottomColor, uHorizonColor, smoothstep(-0.65, 0.05, height));
            sky = mix(sky, uTopColor, smoothstep(-0.08, 0.72, height));
            float horizonGlow = exp(-abs(height + 0.025) * 10.0);
            sky += uHorizonColor * horizonGlow * 0.12;

            if (uStyle > 0.5) {
              float curtainWave = sin(vSkyDirection.x * 10.0 + sin(vSkyDirection.z * 6.0 + uTime * 0.08) * 2.0);
              float curtains = smoothstep(0.05, 0.9, curtainWave)
                * smoothstep(0.02, 0.3, height)
                * (1.0 - smoothstep(0.48, 0.8, height));
              vec3 aurora = mix(vec3(0.04, 0.72, 0.58), vec3(0.42, 0.2, 0.82), smoothstep(-0.35, 0.55, vSkyDirection.x));
              sky += aurora * curtains * 0.42;
            }

            gl_FragColor = vec4(sky, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      })
      this.skyMesh = new THREE.Mesh(this.skyGeometry, this.skyMaterial)
      this.skyMesh.renderOrder = -1000
      this.scene.add(this.skyMesh)
    }

    if (
      environment.fogColor != null &&
      environment.fogNear != null &&
      environment.fogFar != null
    ) {
      this.scene.fog = new THREE.Fog(
        environment.fogColor,
        environment.fogNear,
        environment.fogFar
      )
    } else {
      this.scene.fog = null
    }
  }

  private buildNode(node: SceneProgramNode): void {
    const factory = PRIMITIVE_REGISTRY[node.kind]
    if (!factory) {
      // Modifier nodes (bandAmplitude, envelopeFollower, etc.) have no 3D representation
      return
    }

    let inst: NodeInstance
    try {
      inst = factory({
        three: THREE,
        // compile() has already resolved palette defaults into params, keeping
        // explicit text/grid colour overrides intact.
        params: node.params as Record<string, unknown>,
        id: node.id,
      })
    } catch (err) {
      console.error(
        `[SceneBuilder] Failed to create node "${node.id}" (${node.kind}):`,
        err
      )
      return
    }

    // --- Apply transform ---
    const root = new THREE.Group()
    root.add(inst.object3D)
    const { position, rotation, scale } = node.transform
    root.position.set(...position)
    root.rotation.set(...rotation)
    root.scale.set(...scale)
    this.baseScales.set(node.id, scale)
    if (node.events) {
      const light = new THREE.PointLight(0xffffff, 0, 8)
      root.add(light)
      this.eventLights.set(node.id, light)
    }

    this.scene.add(root)
    this.nodeRoots.set(node.id, root)
    this.instances.set(node.id, inst)
    this.bindings.set(node.id, {
      feature: node.binding.feature,
      gain: node.binding.gain,
      smoothing: node.binding.smoothing,
      value: 0,
    })
  }

  /**
   * Called every frame — propagates feature data and timing to all live instances.
   */
  update(
    features: Record<string, number>,
    t: number,
    dt: number,
    featureStore: FeatureStore | null
  ): void {
    if (this.skyMaterial) this.skyMaterial.uniforms["uTime"].value = t
    const signals = this.signalEvaluator?.evaluate(features, t, dt)
    for (const inst of this.instances.values()) {
      const binding = this.bindings.get(inst.id)
      let bound = signals?.get(inst.id) ?? 0

      if (!this.connectedVisualInputs.has(inst.id) && binding) {
        // Clamp before smoothing so an extreme gain cannot create runaway
        // values. The bound signal is intentionally independent per node so
        // each visual can react to a different feature with its own response.
        const target = Math.min(
          4,
          Math.max(0, (features[binding.feature] ?? 0) * binding.gain)
        )
        const coefficient =
          1 - Math.exp(-dt / (binding.smoothing * 0.5 + 0.001))
        binding.value += (target - binding.value) * coefficient
        bound = binding.value
      }

      try {
        inst.update(features, t, dt, bound)
        const event = evaluateVisualEvent(
          this.programNodes.get(inst.id)?.events,
          featureStore,
          t,
          this.markers
        )
        const baseScale = this.baseScales.get(inst.id)
        const root = this.nodeRoots.get(inst.id)
        if (baseScale && root) {
          const boost =
            event?.action === "pulse"
              ? 1 + event.intensity * 0.5
              : event?.action === "burst"
                ? 1 + event.intensity * 1.25
                : 1
          root.scale.set(
            baseScale[0] * boost,
            baseScale[1] * boost,
            baseScale[2] * boost
          )
        }
        const light = this.eventLights.get(inst.id)
        if (light) {
          light.intensity = event?.action === "flash" ? event.intensity * 8 : 0
        }
      } catch (err) {
        // Don't crash the render loop for a single misbehaving node
        console.error(
          `[SceneBuilder] Error in update for node "${inst.id}":`,
          err
        )
      }
    }

    this.updateCamera(features, t, dt)
  }

  private updateCamera(features: Record<string, number>, t: number, dt: number) {
    const camera = this.camera
    const settings = this.cameraSettings
    if (!camera || !settings) return

    const orbitTarget = Math.min(
      1,
      Math.max(0, features[settings.orbitFeature] ?? 0)
    )
    const shakeTarget = Math.min(
      1,
      Math.max(0, features[settings.shakeFeature] ?? 0)
    )
    const attack = 1 - Math.exp(-dt / 0.035)
    const release = 1 - Math.exp(-dt / 0.22)
    this.cameraOrbitEnergy +=
      (orbitTarget - this.cameraOrbitEnergy) *
      (orbitTarget > this.cameraOrbitEnergy ? attack : release)
    this.cameraShakeEnergy +=
      (shakeTarget - this.cameraShakeEnergy) *
      (shakeTarget > this.cameraShakeEnergy ? attack : release)

    const phase = t * settings.orbitSpeed
    const orbitRadius =
      settings.orbitAmount + this.cameraOrbitEnergy * settings.audioOrbit
    const shakePhase = t * settings.shakeSpeed
    const shake = this.cameraShakeEnergy * settings.shakeAmount
    camera.position.set(
      settings.position[0] +
        Math.sin(phase) * orbitRadius +
        Math.sin(shakePhase * 1.73) * shake,
      settings.position[1] +
        Math.sin(phase * 0.5) * orbitRadius * 0.35 +
        Math.cos(shakePhase * 2.11) * shake * 0.7,
      settings.position[2] +
        (Math.cos(phase) - 1) * orbitRadius +
        Math.sin(shakePhase * 2.71) * shake
    )
    this.cameraTarget.set(...settings.target)
    camera.lookAt(this.cameraTarget)
  }

  /**
   * Dispose all instances and clear the map.
   * Does NOT remove the instances from the scene — call scene.clear() separately.
   */
  dispose(): void {
    for (const inst of this.instances.values()) {
      inst.dispose()
    }
    this.instances.clear()
    this.nodeRoots.clear()
    this.bindings.clear()
    this.connectedVisualInputs.clear()
    this.eventLights.clear()
    this.baseScales.clear()
    this.programNodes.clear()
    this.cameraSettings = null
    this.cameraOrbitEnergy = 0
    this.cameraShakeEnergy = 0
    if (this.skyMesh) this.scene.remove(this.skyMesh)
    this.skyGeometry?.dispose()
    this.skyMaterial?.dispose()
    this.skyMesh = null
    this.skyGeometry = null
    this.skyMaterial = null
    this.signalEvaluator = null
    this.markers = []
  }

  /** Look up the Three.js object for a node by ID (used for picking). */
  getObject(id: string): THREE.Object3D | null {
    return this.instances.get(id)?.object3D ?? null
  }

  /** Return all instance IDs currently in the scene. */
  getInstanceIds(): string[] {
    return Array.from(this.instances.keys())
  }

  /**
   * Given a Three.js Object3D returned by a Raycaster intersect,
   * walk up the parent chain to find the node ID it belongs to.
   */
  resolveNodeId(obj: THREE.Object3D): string | null {
    for (const [id, inst] of this.instances) {
      if (
        obj === inst.object3D ||
        inst.object3D.getObjectById(obj.id) != null
      ) {
        return id
      }
    }
    return null
  }
}
