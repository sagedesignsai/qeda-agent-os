import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useTheme } from 'next-themes';
import {
  AppearanceState,
  DEFAULT_PRESET_ID,
  getPreset,
  loadAppearance,
  mergeTokens,
  saveAppearance,
  ThemeTokens,
} from '@/lib/theme-presets';

interface AppearanceContextValue {
  state: AppearanceState;
  preset: ReturnType<typeof getPreset>;
  setPreset: (id: string) => void;
  setOverride: (mode: 'light' | 'dark', token: string, value: string) => void;
  resetOverrides: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function toHex(color: string): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return color;
    ctx.fillStyle = color;
    return String(ctx.fillStyle);
  } catch {
    return color;
  }
}

function applyAppearance(state: AppearanceState): void {
  const preset = getPreset(state.presetId);
  const light = mergeTokens(preset.light, state.overrides.light);
  const dark = mergeTokens(preset.dark, state.overrides.dark);

  const radius = preset.radius ? `--radius: ${preset.radius};` : '';
  const spacing = preset.spacing ? `--spacing: ${preset.spacing};` : '';

  const lightCss = Object.entries(light)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');
  const darkCss = Object.entries(dark)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');

  const css = `:root { ${lightCss} ${radius} ${spacing} }\n.dark { ${darkCss} ${radius} ${spacing} }`;

  let style = document.getElementById('qeda-appearance');
  if (!style) {
    style = document.createElement('style');
    style.id = 'qeda-appearance';
    document.head.appendChild(style);
  }
  style.textContent = css;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppearanceState>(loadAppearance);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    applyAppearance(state);
    saveAppearance(state);
  }, [state]);

  useEffect(() => {
    const preset = getPreset(state.presetId);
    const tokens =
      resolvedTheme === 'light'
        ? mergeTokens(preset.light, state.overrides.light)
        : mergeTokens(preset.dark, state.overrides.dark);
    const background = toHex(tokens.background);
    const mode = resolvedTheme === 'light' ? 'light' : 'dark';
    window.electron.ipc
      .invoke('theme:save', { mode, background })
      .catch(() => {});
  }, [state, resolvedTheme]);

  const setPreset = useCallback((id: string) => {
    setState((prev) => ({ presetId: id, overrides: {} }));
  }, []);

  const setOverride = useCallback(
    (mode: 'light' | 'dark', token: string, value: string) => {
      setState((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          [mode]: { ...(prev.overrides[mode] ?? {}), [token]: value },
        },
      }));
    },
    [],
  );

  const resetOverrides = useCallback(() => {
    setState((prev) => ({ ...prev, overrides: {} }));
  }, []);

  const value: AppearanceContextValue = {
    state,
    preset: getPreset(state.presetId),
    setPreset,
    setOverride,
    resetOverrides,
  };

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
}
