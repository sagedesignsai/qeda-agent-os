/**
 * components/settings/views/AppearanceView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → "Appearance".
 *
 * The one section that does NOT go through `settings:save`, and that is the
 * point: `settings:save` calls resetAgents() on every write, so persisting a
 * cosmetic choice would needlessly tear down the agent cache. next-themes
 * already owns theme persistence (localStorage) and is mounted at the app root
 * in renderer/App.tsx, so this section is pure renderer state with no IPC.
 *
 * There is deliberately no Save button here. Theme applies the moment it is
 * picked, which is the behaviour users expect from an appearance toggle; a Save
 * button over an already-applied change would be a lie.
 *
 * Scope note: density and radius are tuned in src/renderer/index.css as CSS
 * tokens rather than per-user settings, so they are documented but not exposed
 * as controls.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';

const THEMES = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
] as const;

export function AppearanceView() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label>Theme</Label>
        <p className="text-xs text-muted-foreground">
          Applies immediately and is remembered on this device. Nothing is sent
          anywhere.
        </p>
      </div>

      <ToggleGroup
        type="single"
        // `theme` is undefined until next-themes has read localStorage, which
        // would otherwise make the group uncontrolled and drop the selection.
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

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Density and corner radius</p>
        <p>
          These are tuned with CSS tokens in{' '}
          <code className="font-mono">src/renderer/index.css</code> rather than
          per-user settings — <code className="font-mono">--spacing</code>{' '}
          drives every <code className="font-mono">p-*</code> and{' '}
          <code className="font-mono">size-*</code> utility at once, and{' '}
          <code className="font-mono">--radius</code> drives the whole scale.
          Editing one value there retunes the entire app consistently, which a
          per-user override could not do.
        </p>
      </div>
    </div>
  );
}
