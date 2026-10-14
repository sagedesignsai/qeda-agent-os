/**
 * lib/studio/svg-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Domain types, keyframe schemas, and vector primitives for Showcase Studio's
 * SVGator & After Effects style vector layer animation engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface StudioSvgKeyframe {
  id: string;
  timeMs: number;
  trimPathProgress: number; // 0..1 (0 = not drawn, 1 = fully drawn)
  dashOffset?: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotateDeg: number;
  opacity: number;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring' | 'bounce';
}

export interface StudioSvgFilter {
  type: 'none' | 'glow' | 'drop-shadow' | 'blur' | 'neon';
  color?: string;
  blurRadius: number;
  offsetX?: number;
  offsetY?: number;
}

export interface StudioSvgLayer {
  id: string;
  name: string;
  svgContent: string; // Raw SVG path data (e.g. "M10 80 Q 52.5 10, 95 80 T 180 80") or full SVG markup
  paths: Array<{
    id: string;
    d: string;
    length?: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  }>;
  startMs: number;
  durationMs: number;
  trimPath: {
    enabled: boolean;
    startProgress: number; // 0..1
    endProgress: number;   // 0..1
    dashArray?: number[];
  };
  transform: {
    x: number; // Normalized center offset (-1..1)
    y: number;
    scale: number;
    rotation: number; // Degrees
    opacity: number; // 0..1
  };
  keyframes: StudioSvgKeyframe[];
  filter: StudioSvgFilter;
  viewBox?: string;
}

export interface StudioSvgPreset {
  id: string;
  name: string;
  category: 'logos' | 'shapes' | 'icons' | 'callouts';
  svgMarkup: string;
  defaultLayer: StudioSvgLayer;
}

export const PRESET_SVG_VECTORS: StudioSvgPreset[] = [
  {
    id: 'svg-qeda-lightning',
    name: 'Qeda Finish Lightning Q',
    category: 'logos',
    svgMarkup: `<svg viewBox="0 0 100 100"><path d="M50 10 A40 40 0 1 0 85 75 L70 60 A20 20 0 1 1 50 30 A20 20 0 0 1 70 50 L90 30 Z" fill="none" stroke="#6366f1" stroke-width="6" /><path d="M45 40 L65 40 L50 60 L70 60 L40 90 L50 65 L35 65 Z" fill="#38bdf8" /></svg>`,
    defaultLayer: {
      id: 'layer-qeda-lightning',
      name: 'Qeda Finish Lightning',
      svgContent: 'M50 10 A40 40 0 1 0 85 75 L70 60 A20 20 0 1 1 50 30 A20 20 0 0 1 70 50 L90 30 Z',
      paths: [
        {
          id: 'path-q-outer',
          d: 'M50 10 A40 40 0 1 0 85 75 L70 60 A20 20 0 1 1 50 30 A20 20 0 0 1 70 50 L90 30 Z',
          stroke: '#818cf8',
          strokeWidth: 6,
          fill: 'none',
        },
        {
          id: 'path-bolt',
          d: 'M45 40 L65 40 L50 60 L70 60 L40 90 L50 65 L35 65 Z',
          stroke: '#38bdf8',
          strokeWidth: 4,
          fill: 'rgba(56, 189, 248, 0.2)',
        },
      ],
      startMs: 0,
      durationMs: 5000,
      trimPath: {
        enabled: true,
        startProgress: 0,
        endProgress: 1,
      },
      transform: {
        x: 0,
        y: 0,
        scale: 1.2,
        rotation: 0,
        opacity: 1.0,
      },
      keyframes: [
        {
          id: 'kf-1',
          timeMs: 0,
          trimPathProgress: 0,
          translateX: 0,
          translateY: 0,
          scaleX: 0.8,
          scaleY: 0.8,
          rotateDeg: -15,
          opacity: 0,
          easing: 'easeOut',
        },
        {
          id: 'kf-2',
          timeMs: 2500,
          trimPathProgress: 1.0,
          translateX: 0,
          translateY: 0,
          scaleX: 1.2,
          scaleY: 1.2,
          rotateDeg: 0,
          opacity: 1.0,
          easing: 'easeInOut',
        },
      ],
      filter: {
        type: 'glow',
        color: '#6366f1',
        blurRadius: 16,
      },
    },
  },
  {
    id: 'svg-code-terminal',
    name: 'Code Terminal Badge',
    category: 'icons',
    svgMarkup: `<svg viewBox="0 0 100 100"><rect x="10" y="20" width="80" height="60" rx="8" fill="#0f172a" stroke="#38bdf8" stroke-width="4" /><path d="M25 40 L40 50 L25 60 M45 60 L65 60" stroke="#22c55e" stroke-width="5" stroke-linecap="round" fill="none" /></svg>`,
    defaultLayer: {
      id: 'layer-code-terminal',
      name: 'Code Terminal Badge',
      svgContent: 'M25 40 L40 50 L25 60 M45 60 L65 60',
      paths: [
        {
          id: 'path-term-box',
          d: 'M10 20 h80 a8 8 0 0 1 8 8 v44 a8 8 0 0 1 -8 8 h-80 a8 8 0 0 1 -8 -8 v-44 a8 8 0 0 1 8 -8 z',
          stroke: '#38bdf8',
          strokeWidth: 4,
          fill: 'none',
        },
        {
          id: 'path-prompt',
          d: 'M25 40 L40 50 L25 60 M45 60 L65 60',
          stroke: '#22c55e',
          strokeWidth: 5,
          fill: 'none',
        },
      ],
      startMs: 0,
      durationMs: 4000,
      trimPath: {
        enabled: true,
        startProgress: 0,
        endProgress: 1,
      },
      transform: {
        x: 0,
        y: 0,
        scale: 1.0,
        rotation: 0,
        opacity: 1.0,
      },
      keyframes: [],
      filter: {
        type: 'neon',
        color: '#22c55e',
        blurRadius: 12,
      },
    },
  },
];
