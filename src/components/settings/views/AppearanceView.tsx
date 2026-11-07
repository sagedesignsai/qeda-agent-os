/**
 * components/settings/views/AppearanceView.tsx
 */

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { CompassIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useAppearance } from '@/hooks/use-appearance';
import { ColorField } from '@/components/motion/inspector/controls/color-field';
import { THEME_PRESETS, TOKEN_NAMES } from '@/lib/theme-presets';

const THEMES = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
] as const;

export function AppearanceView() {
  const { theme, setTheme } = useTheme();
  const { state, preset, setPreset, setOverride, resetOverrides } = useAppearance();
  const [editMode, setEditMode] = useState<'light' | 'dark'>('dark');

  const merged = editMode === 'light'
    ? { ...preset.light, ...(state.overrides.light ?? {}) }
    : { ...preset.dark, ...(state.overrides.dark ?? {}) };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>Theme</Label>
        <p className="text-xs text-muted-foreground">
          Applies immediately and is remembered on this device. Nothing is sent
          anywhere.
        </p>
      </div>

      <ToggleGroup
        type="single"
        value={theme ?? 'system'}
        onValueChange={(value) => {
          if (value) setTheme(value);
        }}
        variant="outline"
        className="w-full max-w-sm"
      >
        {THEMES.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={label}
            className="flex-1 gap-1.5"
          >
            <Icon className="size-3.5" />
            <span>{label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="space-y-2">
        <Label>Presets</Label>
      </div>

      <PresetGrid />

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Density and corner radius</p>
        <p>
          Tuned by the active preset (`--radius`, `--spacing`). Editing one
          value retunes the entire app consistently.
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground">App tour</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Re-watch the 4-step overview of Qeda's structure.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              void window.electron.ipc.invoke('settings:save', {
                spotlightTourCompleted: false,
              });
              window.location.reload();
            }}
          >
            <CompassIcon className="size-3.5" />
            Show tour again
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Color tokens (advanced)</Label>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={editMode === 'light' ? 'default' : 'outline'}
              onClick={() => setEditMode('light')}
            >
              Light
            </Button>
            <Button
              size="sm"
              variant={editMode === 'dark' ? 'default' : 'outline'}
              onClick={() => setEditMode('dark')}
            >
              Dark
            </Button>
            <Button size="sm" variant="ghost" onClick={resetOverrides}>
              Reset
            </Button>
          </div>
        </div>
        <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {TOKEN_NAMES.map((token) => (
            <ColorField
              key={token}
              id={`color-${token}`}
              label={token}
              value={merged[token] ?? ''}
              onChange={(value) => setOverride(editMode, token, value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PresetGrid() {
  const { state, setPreset } = useAppearance();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {THEME_PRESETS.map((p) => {
        const active = p.id === state.presetId;
        const swatch = p.dark.primary;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
              active
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <span
              className="size-4 shrink-0 rounded-full border border-border"
              style={{ background: swatch }}
            />
            <span className="truncate">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
