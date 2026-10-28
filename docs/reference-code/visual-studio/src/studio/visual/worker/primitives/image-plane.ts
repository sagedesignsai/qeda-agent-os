/**
 * image-plane.ts — A billboard textured from the studio media library.
 *
 * The worker cannot use the Next.js image pipeline, so the image is fetched
 * from the admin-gated content route (same-origin, so the session cookie is
 * sent) and decoded into an ImageBitmap. Until it arrives the plane is a dark
 * placeholder; a failed fetch leaves the placeholder rather than crashing the
 * scene.
 */

import type { NodeInstance } from "../scene-builder"
import type { PrimitiveContext } from "./registry"
import { THREE } from "../three-imports"

export function createImagePlane(ctx: PrimitiveContext): NodeInstance {
  const { params, id } = ctx

  const size = typeof params.size === "number" ? Math.max(0.1, params.size) : 4
  const baseOpacity =
    typeof params.opacity === "number"
      ? Math.min(1, Math.max(0, params.opacity))
      : 1
  const mediaId = typeof params.mediaId === "string" ? params.mediaId : null
  const paletteColor =
    typeof params.color === "string" ? params.color : "#ffffff"
  const treatment =
    params.treatment === "duotone"
      ? 1
      : params.treatment === "scanline"
        ? 2
        : 0
  const haloStrength =
    typeof params.haloStrength === "number"
      ? Math.min(2, Math.max(0, params.haloStrength))
      : 0.35
  const audioScale =
    typeof params.audioScale === "number"
      ? Math.min(0.5, Math.max(0, params.audioScale))
      : 0.08
  const revealOnset = params.revealOnset === true
  const revealDuration =
    typeof params.revealDuration === "number"
      ? Math.min(3, Math.max(0.15, params.revealDuration))
      : 0.8

  const geometry = new THREE.PlaneGeometry(size, size)
  const material = new THREE.MeshBasicMaterial({
    color: 0x151515,
    transparent: true,
    opacity: baseOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  const haloGeometry = new THREE.PlaneGeometry(size * 1.18, size * 1.18)
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uGlowColor: { value: new THREE.Color(paletteColor) },
      uGlowStrength: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vGlowUv;
      void main() {
        vGlowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlowColor;
      uniform float uGlowStrength;
      varying vec2 vGlowUv;
      void main() {
        float edge = max(abs(vGlowUv.x - 0.5), abs(vGlowUv.y - 0.5)) * 2.0;
        float outerFade = 1.0 - smoothstep(0.76, 1.0, edge);
        float innerFade = smoothstep(0.55, 0.78, edge);
        float glow = outerFade * innerFade * uGlowStrength;
        gl_FragColor = vec4(uGlowColor, glow);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const halo = new THREE.Mesh(haloGeometry, haloMaterial)
  halo.position.z = -0.025
  halo.renderOrder = -1
  const group = new THREE.Group()
  group.add(halo, mesh)

  const revealUniform = { value: 1 }
  const treatmentUniform = { value: treatment }
  const accentUniform = { value: new THREE.Color(paletteColor) }
  material.onBeforeCompile = (shader) => {
    shader.uniforms["uRevealProgress"] = revealUniform
    shader.uniforms["uImageTreatment"] = treatmentUniform
    shader.uniforms["uAccentColor"] = accentUniform
    shader.fragmentShader = `
      uniform float uRevealProgress;
      uniform float uImageTreatment;
      uniform vec3 uAccentColor;
    ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      #ifdef USE_MAP
        float revealMask = 1.0 - smoothstep(
          uRevealProgress - 0.045,
          uRevealProgress + 0.045,
          vMapUv.x
        );
        diffuseColor.a *= revealMask;
        if (uImageTreatment > 0.5 && uImageTreatment < 1.5) {
          float luminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(0.025, 0.018, 0.08), uAccentColor, luminance);
        } else if (uImageTreatment > 1.5) {
          float scanline = 0.82 + 0.18 * sin(vMapUv.y * 900.0);
          diffuseColor.rgb *= scanline;
        }
      #endif`
    )
  }
  material.customProgramCacheKey = () => "sonic-image-plane-treatment-v1"
  material.needsUpdate = true

  let texture: THREE.Texture | null = null
  let bitmapRef: ImageBitmap | null = null
  let disposed = false
  let revealStart = Number.POSITIVE_INFINITY
  let revealProgress = 1
  let previousOnset = 0
  let haloWidthScale = 1
  let haloHeightScale = 1

  if (mediaId) {
    fetch(`/api/studio/media/${encodeURIComponent(mediaId)}/content`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Image request failed (${response.status})`)
        return createImageBitmap(await response.blob())
      })
      .then((bitmap) => {
        if (disposed) {
          bitmap.close()
          return
        }

        bitmapRef = bitmap
        texture = new THREE.Texture(bitmap)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true

        material.map = texture
        material.color.set(paletteColor)
        material.needsUpdate = true
        haloMaterial.uniforms["uGlowColor"].value.set(paletteColor)
        accentUniform.value.set(paletteColor)

        // Preserve the source aspect ratio inside the `size` box.
        const aspect = bitmap.width / Math.max(1, bitmap.height)
        if (aspect >= 1) haloWidthScale = aspect
        else haloHeightScale = 1 / aspect
        mesh.scale.set(haloWidthScale, haloHeightScale, 1)
        halo.scale.set(haloWidthScale, haloHeightScale, 1)
      })
      .catch((error: unknown) => {
        console.warn("[studio/visual] image plane load failed", {
          id,
          mediaId,
          error,
        })
      })
  }

  function update(
    features: Record<string, number>,
    t: number,
    _dt: number,
    bound: number
  ): void {
    const energy = Math.min(1, Math.max(0, bound))
    material.opacity = baseOpacity * (0.78 + energy * 0.22)
    group.scale.setScalar(1 + energy * audioScale)
    haloMaterial.uniforms["uGlowStrength"].value = Math.min(
      0.85,
      haloStrength * (0.12 + energy * 0.7)
    )
    halo.scale.set(
      haloWidthScale * (1 + energy * 0.04),
      haloHeightScale * (1 + energy * 0.04),
      1
    )

    if (revealOnset) {
      const onset = Math.min(1, Math.max(0, features["onset"] ?? 0))
      if (onset > 0.55 && previousOnset <= 0.55) revealStart = t
      previousOnset = onset

      if (t < revealStart) {
        revealStart = Number.POSITIVE_INFINITY
        revealProgress = 1
      } else if (Number.isFinite(revealStart)) {
        revealProgress = Math.min(1, Math.max(0, (t - revealStart) / revealDuration))
      }
      revealUniform.value = revealProgress
    }

  }

  function dispose(): void {
    disposed = true
    geometry.dispose()
    haloGeometry.dispose()
    material.dispose()
    haloMaterial.dispose()
    texture?.dispose()
    bitmapRef?.close()
    bitmapRef = null
  }

  return { id, kind: "imagePlane", update, dispose, object3D: group }
}
