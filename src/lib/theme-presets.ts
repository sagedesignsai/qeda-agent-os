/**
 * lib/theme-presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Predefined appearance presets + the token vocabulary the editor manipulates.
 *
 * A preset is mode-agnostic: it ships both a light and a dark token set (plus
 * optional radius/spacing) so the user can switch light/dark independently of
 * the colour palette. Manual edits are stored as partial overrides that merge
 * over the active preset's tokens.
 */

export type ThemeTokens = Record<string, string>;

export interface ThemePreset {
  id: string;
  name: string;
  light: ThemeTokens;
  dark: ThemeTokens;
  radius?: string;
  spacing?: string;
}

export interface AppearanceState {
  presetId: string;
  overrides: { light?: Partial<ThemeTokens>; dark?: Partial<ThemeTokens> };
}

const QEDA_LIGHT: ThemeTokens = {
  background: 'oklch(0.992 0.003 255)',
  foreground: 'oklch(0.215 0.018 262)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.215 0.018 262)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0.215 0.018 262)',
  primary: 'oklch(0.545 0.2 258)',
  'primary-foreground': 'oklch(0.99 0 0)',
  secondary: 'oklch(0.963 0.009 258)',
  'secondary-foreground': 'oklch(0.29 0.022 262)',
  muted: 'oklch(0.963 0.009 258)',
  'muted-foreground': 'oklch(0.505 0.022 258)',
  accent: 'oklch(0.945 0.03 258)',
  'accent-foreground': 'oklch(0.44 0.19 259)',
  destructive: 'oklch(0.577 0.245 27.325)',
  'destructive-foreground': 'oklch(0.985 0 0)',
  border: 'oklch(0.912 0.011 258)',
  input: 'oklch(0.912 0.011 258)',
  ring: 'oklch(0.545 0.2 258)',
  'chart-1': 'oklch(0.545 0.2 258)',
  'chart-2': 'oklch(0.62 0.14 205)',
  'chart-3': 'oklch(0.6 0.15 160)',
  'chart-4': 'oklch(0.7 0.15 85)',
  'chart-5': 'oklch(0.62 0.2 330)',
  sidebar: 'oklch(0.978 0.005 255)',
  'sidebar-foreground': 'oklch(0.215 0.018 262)',
  'sidebar-primary': 'oklch(0.545 0.2 258)',
  'sidebar-primary-foreground': 'oklch(0.99 0 0)',
  'sidebar-accent': 'oklch(0.945 0.03 258)',
  'sidebar-accent-foreground': 'oklch(0.44 0.19 259)',
  'sidebar-border': 'oklch(0.912 0.011 258)',
  'sidebar-ring': 'oklch(0.545 0.2 258)',
};

const QEDA_DARK: ThemeTokens = {
  background: 'oklch(0.155 0.016 262)',
  foreground: 'oklch(0.975 0.003 255)',
  card: 'oklch(0.198 0.018 262)',
  'card-foreground': 'oklch(0.975 0.003 255)',
  popover: 'oklch(0.212 0.019 262)',
  'popover-foreground': 'oklch(0.975 0.003 255)',
  primary: 'oklch(0.62 0.18 257)',
  'primary-foreground': 'oklch(0.99 0.005 255)',
  secondary: 'oklch(0.258 0.022 262)',
  'secondary-foreground': 'oklch(0.96 0.004 255)',
  muted: 'oklch(0.258 0.022 262)',
  'muted-foreground': 'oklch(0.712 0.024 258)',
  accent: 'oklch(0.3 0.055 259)',
  'accent-foreground': 'oklch(0.87 0.065 254)',
  destructive: 'oklch(0.655 0.2 25)',
  'destructive-foreground': 'oklch(0.99 0.005 255)',
  border: 'oklch(0.88 0.02 262 / 11%)',
  input: 'oklch(0.88 0.02 262 / 14%)',
  ring: 'oklch(0.62 0.18 257)',
  'chart-1': 'oklch(0.62 0.18 257)',
  'chart-2': 'oklch(0.7 0.14 205)',
  'chart-3': 'oklch(0.72 0.15 160)',
  'chart-4': 'oklch(0.78 0.14 85)',
  'chart-5': 'oklch(0.7 0.19 330)',
  sidebar: 'oklch(0.175 0.017 262)',
  'sidebar-foreground': 'oklch(0.95 0.004 255)',
  'sidebar-primary': 'oklch(0.62 0.18 257)',
  'sidebar-primary-foreground': 'oklch(0.99 0.005 255)',
  'sidebar-accent': 'oklch(0.295 0.055 259)',
  'sidebar-accent-foreground': 'oklch(0.87 0.065 254)',
  'sidebar-border': 'oklch(0.88 0.02 262 / 8%)',
  'sidebar-ring': 'oklch(0.62 0.18 257)',
};

function clone(t: ThemeTokens): ThemeTokens {
  return { ...t };
}

function recolor(t: ThemeTokens, primary: string, accent: string): ThemeTokens {
  const out = clone(t);
  out.primary = primary;
  out.ring = primary;
  out['chart-1'] = primary;
  out['sidebar-primary'] = primary;
  out['sidebar-ring'] = primary;
  out.accent = accent;
  out['sidebar-accent'] = accent;
  return out;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'qeda-azure',
    name: 'Qeda Azure',
    light: QEDA_LIGHT,
    dark: QEDA_DARK,
    radius: '0.375rem',
    spacing: '0.225rem',
  },
  {
    id: 'neutral',
    name: 'Neutral',
    light: recolor(QEDA_LIGHT, 'oklch(0.205 0 0)', 'oklch(0.97 0 0)'),
    dark: recolor(QEDA_DARK, 'oklch(0.922 0 0)', 'oklch(0.269 0 0)'),
    radius: '0.625rem',
    spacing: '0.25rem',
  },
  {
    id: 'rose',
    name: 'Rose',
    light: recolor(QEDA_LIGHT, 'oklch(0.6 0.22 10)', 'oklch(0.95 0.04 10)'),
    dark: recolor(QEDA_DARK, 'oklch(0.7 0.19 10)', 'oklch(0.32 0.06 10)'),
    radius: '0.5rem',
    spacing: '0.225rem',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    light: recolor(QEDA_LIGHT, 'oklch(0.55 0.16 160)', 'oklch(0.94 0.04 160)'),
    dark: recolor(QEDA_DARK, 'oklch(0.68 0.17 160)', 'oklch(0.28 0.06 160)'),
    radius: '0.375rem',
    spacing: '0.225rem',
  },
  {
    id: 'violet',
    name: 'Violet',
    light: recolor(QEDA_LIGHT, 'oklch(0.56 0.22 290)', 'oklch(0.94 0.04 290)'),
    dark: recolor(QEDA_DARK, 'oklch(0.66 0.2 290)', 'oklch(0.3 0.06 290)'),
    radius: '0.375rem',
    spacing: '0.225rem',
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    light: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      card: '#ccd0da',
      'card-foreground': '#4c4f69',
      popover: '#bcc0cc',
      'popover-foreground': '#4c4f69',
      primary: '#1e66f5',
      'primary-foreground': '#eff1f5',
      secondary: '#bcc0cc',
      'secondary-foreground': '#4c4f69',
      muted: '#ccd0da',
      'muted-foreground': '#6c6f85',
      accent: '#bcc0cc',
      'accent-foreground': '#4c4f69',
      destructive: '#d20f39',
      'destructive-foreground': '#eff1f5',
      border: '#acb0be',
      input: '#acb0be',
      ring: '#1e66f5',
      'chart-1': '#1e66f5',
      'chart-2': '#40a02b',
      'chart-3': '#df8e1d',
      'chart-4': '#fe640b',
      'chart-5': '#8839ef',
      sidebar: '#e6e9ef',
      'sidebar-foreground': '#4c4f69',
      'sidebar-primary': '#1e66f5',
      'sidebar-primary-foreground': '#eff1f5',
      'sidebar-accent': '#bcc0cc',
      'sidebar-accent-foreground': '#4c4f69',
      'sidebar-border': '#acb0be',
      'sidebar-ring': '#1e66f5',
    },
    dark: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      card: '#313244',
      'card-foreground': '#cdd6f4',
      popover: '#45475a',
      'popover-foreground': '#cdd6f4',
      primary: '#89b4fa',
      'primary-foreground': '#11111b',
      secondary: '#45475a',
      'secondary-foreground': '#cdd6f4',
      muted: '#313244',
      'muted-foreground': '#a6adc8',
      accent: '#45475a',
      'accent-foreground': '#cdd6f4',
      destructive: '#f38ba8',
      'destructive-foreground': '#11111b',
      border: '#585b70',
      input: '#585b70',
      ring: '#89b4fa',
      'chart-1': '#89b4fa',
      'chart-2': '#a6e3a1',
      'chart-3': '#f9e2af',
      'chart-4': '#fab387',
      'chart-5': '#cba6f7',
      sidebar: '#181825',
      'sidebar-foreground': '#cdd6f4',
      'sidebar-primary': '#89b4fa',
      'sidebar-primary-foreground': '#11111b',
      'sidebar-accent': '#45475a',
      'sidebar-accent-foreground': '#cdd6f4',
      'sidebar-border': '#585b70',
      'sidebar-ring': '#89b4fa',
    },
    radius: '0.5rem',
    spacing: '0.25rem',
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    light: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      card: '#ccd0da',
      'card-foreground': '#4c4f69',
      popover: '#bcc0cc',
      'popover-foreground': '#4c4f69',
      primary: '#89b4fa',
      'primary-foreground': '#1e1e2e',
      secondary: '#bcc0cc',
      'secondary-foreground': '#4c4f69',
      muted: '#ccd0da',
      'muted-foreground': '#6c6f85',
      accent: '#bcc0cc',
      'accent-foreground': '#4c4f69',
      destructive: '#f38ba8',
      'destructive-foreground': '#1e1e2e',
      border: '#acb0be',
      input: '#acb0be',
      ring: '#89b4fa',
      'chart-1': '#89b4fa',
      'chart-2': '#a6e3a1',
      'chart-3': '#f9e2af',
      'chart-4': '#fab387',
      'chart-5': '#cba6f7',
      sidebar: '#e6e9ef',
      'sidebar-foreground': '#4c4f69',
      'sidebar-primary': '#89b4fa',
      'sidebar-primary-foreground': '#1e1e2e',
      'sidebar-accent': '#bcc0cc',
      'sidebar-accent-foreground': '#4c4f69',
      'sidebar-border': '#acb0be',
      'sidebar-ring': '#89b4fa',
    },
    dark: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      card: '#313244',
      'card-foreground': '#cdd6f4',
      popover: '#45475a',
      'popover-foreground': '#cdd6f4',
      primary: '#89b4fa',
      'primary-foreground': '#11111b',
      secondary: '#45475a',
      'secondary-foreground': '#cdd6f4',
      muted: '#313244',
      'muted-foreground': '#a6adc8',
      accent: '#45475a',
      'accent-foreground': '#cdd6f4',
      destructive: '#f38ba8',
      'destructive-foreground': '#11111b',
      border: '#585b70',
      input: '#585b70',
      ring: '#89b4fa',
      'chart-1': '#89b4fa',
      'chart-2': '#a6e3a1',
      'chart-3': '#f9e2af',
      'chart-4': '#fab387',
      'chart-5': '#cba6f7',
      sidebar: '#181825',
      'sidebar-foreground': '#cdd6f4',
      'sidebar-primary': '#89b4fa',
      'sidebar-primary-foreground': '#11111b',
      'sidebar-accent': '#45475a',
      'sidebar-accent-foreground': '#cdd6f4',
      'sidebar-border': '#585b70',
      'sidebar-ring': '#89b4fa',
    },
    radius: '0.5rem',
    spacing: '0.25rem',
  },
  {
    id: 'bearded-arc-blueberry',
    name: 'Bearded Arc Blueberry',
    light: {
      background: '#f1f3f9',
      foreground: '#3c4053',
      card: '#e6e9f2',
      'card-foreground': '#3c4053',
      popover: '#dfe2ec',
      'popover-foreground': '#3c4053',
      primary: '#4a6fb5',
      'primary-foreground': '#f1f3f9',
      secondary: '#dfe2ec',
      'secondary-foreground': '#3c4053',
      muted: '#e6e9f2',
      'muted-foreground': '#6b7280',
      accent: '#dfe2ec',
      'accent-foreground': '#3c4053',
      destructive: '#d63a2f',
      'destructive-foreground': '#f1f3f9',
      border: '#c7cad6',
      input: '#c7cad6',
      ring: '#4a6fb5',
      'chart-1': '#4a6fb5',
      'chart-2': '#2f9e6e',
      'chart-3': '#d4a017',
      'chart-4': '#d97745',
      'chart-5': '#8b5cf6',
      sidebar: '#e6e9f2',
      'sidebar-foreground': '#3c4053',
      'sidebar-primary': '#4a6fb5',
      'sidebar-primary-foreground': '#f1f3f9',
      'sidebar-accent': '#dfe2ec',
      'sidebar-accent-foreground': '#3c4053',
      'sidebar-border': '#c7cad6',
      'sidebar-ring': '#4a6fb5',
    },
    dark: {
      background: '#111422',
      foreground: '#c0c4d8',
      card: '#1a1e33',
      'card-foreground': '#c0c4d8',
      popover: '#252937',
      'popover-foreground': '#c0c4d8',
      primary: '#8eb0e6',
      'primary-foreground': '#111422',
      secondary: '#252937',
      'secondary-foreground': '#c0c4d8',
      muted: '#1a1e33',
      'muted-foreground': '#a1a7c4',
      accent: '#2b3255',
      'accent-foreground': '#c0c4d8',
      destructive: '#e35535',
      'destructive-foreground': '#111422',
      border: '#444c6e',
      input: '#444c6e',
      ring: '#8eb0e6',
      'chart-1': '#69c3ff',
      'chart-2': '#3cec85',
      'chart-3': '#eacd61',
      'chart-4': '#ff955c',
      'chart-5': '#f38cec',
      sidebar: '#0d101b',
      'sidebar-foreground': '#a1a7c4',
      'sidebar-primary': '#8eb0e6',
      'sidebar-primary-foreground': '#111422',
      'sidebar-accent': '#2b3255',
      'sidebar-accent-foreground': '#c0c4d8',
      'sidebar-border': '#444c6e',
      'sidebar-ring': '#8eb0e6',
    },
    radius: '0.5rem',
    spacing: '0.25rem',
  },
];

export const TOKEN_NAMES = Object.keys(QEDA_LIGHT) as (keyof ThemeTokens)[];

export const DEFAULT_PRESET_ID = 'qeda-azure';

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

export function mergeTokens(
  base: ThemeTokens,
  override?: Partial<ThemeTokens>,
): ThemeTokens {
  return override ? ({ ...base, ...override } as ThemeTokens) : { ...base };
}

export function loadAppearance(): AppearanceState {
  try {
    const raw = localStorage.getItem('qeda:appearance');
    if (!raw) return { presetId: DEFAULT_PRESET_ID, overrides: {} };
    const parsed = JSON.parse(raw) as Partial<AppearanceState>;
    return {
      presetId: parsed.presetId ?? DEFAULT_PRESET_ID,
      overrides: parsed.overrides ?? {},
    };
  } catch {
    return { presetId: DEFAULT_PRESET_ID, overrides: {} };
  }
}

export function saveAppearance(state: AppearanceState): void {
  localStorage.setItem('qeda:appearance', JSON.stringify(state));
}
