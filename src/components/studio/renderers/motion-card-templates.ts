/**
 * components/studio/renderers/motion-card-templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Intro/Outro motion card template presets with customizable branding support.
 *
 * Each template defines:
 * - Background gradient stops and colors
 * - Typography (family, sizes, weights)
 * - Accent colors and glow effects
 * - Animation behavior (fade curve, progress bar style)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MotionCardPresetName = 'minimal' | 'kinetic' | 'gradient' | 'cyber';

export interface MotionCardTemplate {
  preset: MotionCardPresetName;
  backgroundGradient: {
    type: 'radial' | 'linear';
    stops: Array<{ offset: number; color: string }>;
  };
  typography: {
    fontFamily: string;
    title: { size: number; weight: number | string; color: string };
    subtitle: { size: number; weight: number | string; color: string };
    badge: { size: number; weight: number | string; color: string };
  };
  accent: {
    progressBarColor: string;
    glowColor?: string;
    glowBlur?: number;
  };
  animations: {
    fadeInDuration: number; // ms
    fadeOutDuration: number; // ms
    progressBarStyle: 'solid' | 'gradient' | 'animated';
  };
}

/**
 * Minimal preset: Clean, modern, high-contrast typography on dark backdrop.
 * Best for professional, corporate, or minimal branding.
 */
export const TEMPLATE_MINIMAL: MotionCardTemplate = {
  preset: 'minimal',
  backgroundGradient: {
    type: 'linear',
    stops: [
      { offset: 0, color: '#090d16' },
      { offset: 1, color: '#0f1419' },
    ],
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    title: { size: 52, weight: 800, color: '#ffffff' },
    subtitle: { size: 18, weight: 400, color: 'rgba(226, 232, 240, 0.85)' },
    badge: { size: 14, weight: 700, color: '#818cf8' },
  },
  accent: {
    progressBarColor: '#6366f1',
    glowColor: undefined,
    glowBlur: 0,
  },
  animations: {
    fadeInDuration: 300,
    fadeOutDuration: 300,
    progressBarStyle: 'solid',
  },
};

/**
 * Kinetic preset: Radial spotlight glow, bold headline, floating badge.
 * Best for dynamic, energetic, high-energy content.
 */
export const TEMPLATE_KINETIC: MotionCardTemplate = {
  preset: 'kinetic',
  backgroundGradient: {
    type: 'radial',
    stops: [
      { offset: 0, color: '#1e1b4b' },
      { offset: 0.6, color: '#0f172a' },
      { offset: 1, color: '#020617' },
    ],
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    title: { size: 56, weight: 800, color: '#a5b4fc' },
    subtitle: { size: 20, weight: 400, color: 'rgba(226, 232, 240, 0.8)' },
    badge: { size: 14, weight: 700, color: '#a78bfa' },
  },
  accent: {
    progressBarColor: '#a78bfa',
    glowColor: 'rgba(167, 139, 250, 0.3)',
    glowBlur: 20,
  },
  animations: {
    fadeInDuration: 400,
    fadeOutDuration: 400,
    progressBarStyle: 'gradient',
  },
};

/**
 * Gradient preset: Mesh gradient background, headline, subtitle, primary pill.
 * Best for creative, artistic, or trendy content.
 */
export const TEMPLATE_GRADIENT: MotionCardTemplate = {
  preset: 'gradient',
  backgroundGradient: {
    type: 'linear',
    stops: [
      { offset: 0, color: '#312e81' },
      { offset: 0.5, color: '#4c1d95' },
      { offset: 1, color: '#0f172a' },
    ],
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    title: { size: 54, weight: 800, color: '#ffffff' },
    subtitle: { size: 19, weight: 400, color: 'rgba(226, 232, 240, 0.82)' },
    badge: { size: 14, weight: 700, color: '#fbbf24' },
  },
  accent: {
    progressBarColor: '#fbbf24',
    glowColor: 'rgba(251, 191, 36, 0.25)',
    glowBlur: 16,
  },
  animations: {
    fadeInDuration: 350,
    fadeOutDuration: 350,
    progressBarStyle: 'animated',
  },
};

/**
 * Cyber preset: High-tech glass, cyan/purple glow border, mono subtitle.
 * Best for tech, gaming, or futuristic content.
 */
export const TEMPLATE_CYBER: MotionCardTemplate = {
  preset: 'cyber',
  backgroundGradient: {
    type: 'linear',
    stops: [
      { offset: 0, color: '#030712' },
      { offset: 1, color: '#0a0e27' },
    ],
  },
  typography: {
    fontFamily: 'Courier New, monospace',
    title: { size: 52, weight: 800, color: '#22d3ee' },
    subtitle: { size: 17, weight: 400, color: '#94a3b8' },
    badge: { size: 13, weight: 700, color: '#38bdf8' },
  },
  accent: {
    progressBarColor: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    glowBlur: 24,
  },
  animations: {
    fadeInDuration: 250,
    fadeOutDuration: 250,
    progressBarStyle: 'solid',
  },
};

/**
 * Get a motion card template by preset name.
 * @param preset Template preset name
 * @returns Motion card template configuration
 */
export function getMotionCardTemplate(preset: MotionCardPresetName): MotionCardTemplate {
  const templates: Record<MotionCardPresetName, MotionCardTemplate> = {
    minimal: TEMPLATE_MINIMAL,
    kinetic: TEMPLATE_KINETIC,
    gradient: TEMPLATE_GRADIENT,
    cyber: TEMPLATE_CYBER,
  };
  return templates[preset] || TEMPLATE_MINIMAL;
}

/**
 * Customize a motion card template with brand colors/fonts.
 * @param baseTemplate Base template
 * @param overrides Partial overrides
 * @returns Merged template
 */
export function customizeMotionCardTemplate(
  baseTemplate: MotionCardTemplate,
  overrides: Partial<MotionCardTemplate>,
): MotionCardTemplate {
  return {
    ...baseTemplate,
    ...overrides,
    typography: {
      ...baseTemplate.typography,
      ...(overrides.typography || {}),
    },
    accent: {
      ...baseTemplate.accent,
      ...(overrides.accent || {}),
    },
    animations: {
      ...baseTemplate.animations,
      ...(overrides.animations || {}),
    },
  };
}
