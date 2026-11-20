/**
 * components/motion/scene/motion-look-effects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The bridge between a look node and a `postprocessing` effect instance.
 *
 * Effects are created once per node id and then *mutated* every frame. Rebuilding
 * an `EffectPass` recompiles a shader, so doing that on an animated slider would
 * stutter; syncing uniforms is the cheap path.
 *
 * `grade` and `letterbox` have no stock implementation, so they are small custom
 * effects here. Everything else maps to the library's effect so we inherit its
 * depth handling, mipmap bloom and mobile-tested shaders.
 */

import {
  BloomEffect,
  BlendFunction,
  ChromaticAberrationEffect,
  Effect,
  LensDistortionEffect,
  NoiseEffect,
  VignetteEffect,
} from 'postprocessing';
import { Uniform, Vector2 } from 'three';

import type { MotionLookKind, MotionLookParams } from '@/lib/motion/look';

/** Per-frame values that do not come from the node itself. */
export type LookEffectFrame = {
  /** Drawing-buffer aspect, used by letterbox to place its bars. */
  frameAspect: number;
  /** Document playhead time; keeps animated effects identical in preview/export. */
  time: number;
};

export type LookEffectInstance = {
  kind: MotionLookKind;
  effect: Effect;
  sync: (params: MotionLookParams['props'], frame: LookEffectFrame) => void;
};

/**
 * Exposure, contrast, saturation and a two-axis white balance. Deliberately not
 * a 3D LUT: a LUT needs an asset pipeline, and this covers the "shot on film"
 * move people actually reach for at this stage.
 */
const GRADE_FRAGMENT = /* glsl */ `
uniform float exposure;
uniform float contrast;
uniform float saturation;
uniform float temperature;
uniform float tint;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = inputColor.rgb;

  color *= exp2(exposure);
  color = (color - 0.5) * (1.0 + contrast) + 0.5;

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, clamp(1.0 + saturation, 0.0, 2.0));

  // Temperature shifts red against blue; tint shifts magenta against green.
  color.r *= 1.0 + temperature * 0.14;
  color.b *= 1.0 - temperature * 0.14;
  color.r *= 1.0 + tint * 0.05;
  color.b *= 1.0 + tint * 0.05;
  color.g *= 1.0 - tint * 0.10;

  outputColor = vec4(max(color, vec3(0.0)), inputColor.a);
}
`;

const LETTERBOX_FRAGMENT = /* glsl */ `
uniform float frameAspect;
uniform float targetAspect;
uniform float barOpacity;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Bars go on the axis that has room: a wider target crops height, a taller
  // target crops width. The visible fraction is the ratio of the two aspects.
  float visible = targetAspect > frameAspect
    ? frameAspect / targetAspect
    : targetAspect / frameAspect;
  float bar = max(0.0, (1.0 - visible) * 0.5);

  bool outside = targetAspect > frameAspect
    ? (uv.y < bar || uv.y > 1.0 - bar)
    : (uv.x < bar || uv.x > 1.0 - bar);

  outputColor = outside ? vec4(0.0, 0.0, 0.0, barOpacity) : inputColor;
}
`;

const SCANLINE_FRAGMENT = /* glsl */ `
uniform float intensity;
uniform float density;
uniform float speed;
uniform float time;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float phase = (uv.y * density + time * speed) * 6.28318530718;
  float line = 0.5 + 0.5 * cos(phase);
  float attenuation = 1.0 - intensity * line;
  outputColor = vec4(inputColor.rgb * attenuation, inputColor.a);
}
`;

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createLookEffect(kind: MotionLookKind): LookEffectInstance {
  switch (kind) {
    case 'bloom': {
      const effect = new BloomEffect({
        intensity: 0.7,
        luminanceThreshold: 0.8,
        luminanceSmoothing: 0.3,
        mipmapBlur: true,
      });
      return {
        kind,
        effect,
        sync: (props) => {
          effect.intensity = number(props.intensity, 0.7);
          effect.luminanceMaterial.threshold = number(props.threshold, 0.8);
          effect.luminanceMaterial.smoothing = number(props.smoothing, 0.3);
        },
      };
    }

    case 'grade': {
      const uniforms = new Map<string, Uniform>([
        ['exposure', new Uniform(0)],
        ['contrast', new Uniform(0)],
        ['saturation', new Uniform(0)],
        ['temperature', new Uniform(0)],
        ['tint', new Uniform(0)],
      ]);
      const effect = new Effect('MotionGrade', GRADE_FRAGMENT, {
        blendFunction: BlendFunction.NORMAL,
        uniforms,
      });
      const set = (name: string, value: unknown, fallback: number) => {
        const uniform = uniforms.get(name);
        if (uniform) uniform.value = number(value, fallback);
      };
      return {
        kind,
        effect,
        sync: (props) => {
          set('exposure', props.exposure, 0);
          set('contrast', props.contrast, 0);
          set('saturation', props.saturation, 0);
          set('temperature', props.temperature, 0);
          set('tint', props.tint, 0);
        },
      };
    }

    case 'chroma': {
      const effect = new ChromaticAberrationEffect({
        radialModulation: true,
        modulationOffset: 0.15,
      });
      return {
        kind,
        effect,
        sync: (props) => {
          const offset = number(props.offset, 0.0015);
          effect.offset.set(offset, offset);
          effect.radialModulation = props.radial !== false;
          effect.modulationOffset = number(props.modulationOffset, 0.15);
        },
      };
    }

    case 'vignette': {
      const effect = new VignetteEffect({ offset: 0.3, darkness: 0.55 });
      return {
        kind,
        effect,
        sync: (props) => {
          const offset = effect.uniforms.get('offset');
          const darkness = effect.uniforms.get('darkness');
          if (offset) offset.value = number(props.offset, 0.3);
          if (darkness) darkness.value = number(props.darkness, 0.55);
        },
      };
    }

    case 'grain': {
      const effect = new NoiseEffect({
        blendFunction: BlendFunction.NORMAL,
        premultiply: true,
      });
      effect.blendMode.opacity.value = 0.11;
      return {
        kind,
        effect,
        sync: (props) => {
          // Half of the slider so the top of the range stays filmic rather than
          // looking like a broken sensor.
          effect.blendMode.opacity.value = number(props.amount, 0.22) * 0.5;
        },
      };
    }

    case 'letterbox': {
      const uniforms = new Map<string, Uniform>([
        ['frameAspect', new Uniform(16 / 9)],
        ['targetAspect', new Uniform(2.39)],
        ['barOpacity', new Uniform(1)],
      ]);
      const effect = new Effect('MotionLetterbox', LETTERBOX_FRAGMENT, {
        blendFunction: BlendFunction.NORMAL,
        uniforms,
      });
      return {
        kind,
        effect,
        sync: (props, frame) => {
          const target = uniforms.get('targetAspect');
          const aspect = uniforms.get('frameAspect');
          const opacity = uniforms.get('barOpacity');
          if (target) target.value = number(props.aspect, 2.39);
          if (aspect) aspect.value = Math.max(0.01, frame.frameAspect);
          if (opacity) opacity.value = number(props.opacity, 1);
        },
      };
    }

    case 'scanline': {
      const uniforms = new Map<string, Uniform>([
        ['intensity', new Uniform(0.18)],
        ['density', new Uniform(480)],
        ['speed', new Uniform(0)],
        ['time', new Uniform(0)],
      ]);
      const effect = new Effect('MotionScanlines', SCANLINE_FRAGMENT, {
        blendFunction: BlendFunction.NORMAL,
        uniforms,
      });
      return {
        kind,
        effect,
        sync: (props, frame) => {
          const intensity = uniforms.get('intensity');
          const density = uniforms.get('density');
          const speed = uniforms.get('speed');
          const time = uniforms.get('time');
          if (intensity) intensity.value = number(props.intensity, 0.18);
          if (density) density.value = number(props.density, 480);
          if (speed) speed.value = number(props.speed, 0);
          if (time) time.value = frame.time;
        },
      };
    }

    case 'lens-distortion': {
      const effect = new LensDistortionEffect({
        distortion: new Vector2(),
        principalPoint: new Vector2(),
        focalLength: new Vector2(1, 1),
      });
      return {
        kind,
        effect,
        sync: (props) => {
          effect.distortion.set(
            number(props.radial1, 0),
            number(props.radial2, 0),
          );
        },
      };
    }
  }
}
