/**
 * lib/studio/effects/zoom-presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Kinetic camera-zoom presets offered by the Content Panel's Effects tab.
 *
 * These are distinct from canvas effects: a zoom writes into `take.zooms` (the
 * camera transform), whereas a canvas effect writes into `take.effects`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface StudioZoomPreset {
  id: string;
  label: string;
  description: string;
  scale: number;
  targetX: number;
  targetY: number;
  durationMs: number;
  accent: string;
}

export const STUDIO_ZOOM_PRESETS: StudioZoomPreset[] = [
  {
    id: 'zoom-focus-15',
    label: '1.5x Focus Zoom',
    description: 'Gentle punch-in on the frame centre.',
    scale: 1.5,
    targetX: 0.5,
    targetY: 0.5,
    durationMs: 2500,
    accent: '#8b5cf6',
  },
  {
    id: 'zoom-macro-20',
    label: '2.0x Macro Punch-in',
    description: 'Aggressive magnify for detail moments.',
    scale: 2.0,
    targetX: 0.5,
    targetY: 0.5,
    durationMs: 2000,
    accent: '#7c3aed',
  },
  {
    id: 'zoom-pan-left',
    label: 'Pan Left Reveal',
    description: 'Dolly toward the left third of the frame.',
    scale: 1.6,
    targetX: 0.28,
    targetY: 0.45,
    durationMs: 3000,
    accent: '#a78bfa',
  },
  {
    id: 'zoom-pan-right',
    label: 'Pan Right Reveal',
    description: 'Dolly toward the right third of the frame.',
    scale: 1.6,
    targetX: 0.72,
    targetY: 0.45,
    durationMs: 3000,
    accent: '#a78bfa',
  },
];
