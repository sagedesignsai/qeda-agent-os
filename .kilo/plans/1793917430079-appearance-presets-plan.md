# Appearance: baseline token controls + predefined themes

## Goal

Extend `AppearanceView` (Settings → Appearance) from a light/dark/system toggle into a real theming surface: selectable predefined theme presets, a color-token editor for the semantic palette, and persistence that survives reloads — without triggering the agent-cache reset that `settings:save` causes. Also close two theming gaps found during inspection (`--destructive-foreground` missing; hardcoded chrome colors).

## Decisions

- Persistence is renderer-side via `localStorage` (key `qeda:appearance`), matching next-themes. Native window/splash chrome tracks the selected theme through a separate small `theme.json` in `userData` written via dedicated IPC (`theme:get`/`theme:save`), so no `settings:save`/`resetAgents()` path is involved.
- Presets are mode-agnostic: each provides both `light` and `dark` token sets plus optional `radius`/`spacing`. Mode (light/dark/system) stays independently controlled by next-themes.
- Manual editor covers **colors only** (surfaces, accents, borders, charts, sidebar). Density (`--spacing`), radius (`--radius`), and font tokens remain preset-level/CSS-level levers, not per-token sliders.
- Token values in the editor are hex (native `<input type="color">`); base preset values stay oklch. Overrides are partial and merge over the preset.
- Native chrome (window `backgroundColor`, splash) reads the persisted background on startup and falls back to `nativeTheme` when absent.

## Files to change / create

1. `src/renderer/index.css` — add `--destructive-foreground` to `:root` and `.dark`, map `--color-destructive-foreground` in `@theme inline`. (Closes dead-utility gap.)
2. `src/lib/theme-presets.ts` (new) — `ThemePreset` type, built-in presets (first = current Qeda Azure values extracted from `index.css`), merge helpers.
3. `src/hooks/use-appearance.ts` (new) — provider that reads `localStorage`, injects a `<style id="qeda-appearance">` tag with `:root`/`.dark` overrides + radius/spacing, and re-applies on preset/override/mode changes.
4. `src/renderer/App.tsx` — wrap tree in `AppearanceProvider` (inside `ThemeProvider`).
5. `src/components/settings/views/AppearanceView.tsx` — preset grid, mode toggle (existing), advanced Light/Dark color editor, reset-to-preset.
6. `src/main/ipc/channels.ts` — add `theme:get` / `theme:save`.
7. `src/main/ipc/handlers/theme.ts` (new) — read/write `userData/theme.json`.
8. `src/main/ipc/index.ts` — register theme handlers.
9. `src/main/main.ts` — read persisted background for `BrowserWindow.backgroundColor`.
10. `src/main/splash.ts` — read persisted background/logo color.
11. `src/components/AppLoadingOverlay.tsx` — replace `#0e0f14`/`bg-zinc-50`/`text-zinc-*` with design tokens.

## Implementation notes

- Extract the current `:root`/`.dark` token blocks verbatim into the default preset so the default appearance is byte-identical to today.
- Overrides stored as `{ light?: Partial<ThemeTokens>, dark?: Partial<ThemeTokens> }`; merge order: preset → overrides.
- The injected style tag must be regenerated (not patched) on any change to avoid stale rules; remove it on unmount/reset.
- `theme:save` payload: `{ mode, background }`. Handler writes atomically (write temp + rename) and creates the file if missing.
- Main reads the file synchronously with `fs.readFileSync` inside `createWindow`/`buildSplashHtml` (or a shared helper in `splash.ts`); missing file → fall back to `nativeTheme.shouldUseDarkColors`.
- Renderer calls `theme:save` whenever the applied background changes (debounced) so native chrome follows.

## Risks

- Flash of default theme before `localStorage` is read: mitigate by reading synchronously in the provider's initial state (lazy `useState` initializer) and rendering the style tag during first paint.
- oklch base values can't be edited via native color picker; editor converts only override hex values; mixed formats are valid CSS.
- Adding `--destructive-foreground` must not break existing `bg-destructive/10 text-destructive` usages (additive only).

## Validation

- `bun run build` (required before tests).
- `bun test -- -t "settings-dialog|terminal-theme"` still pass.
- Manual: switch presets, edit a color, reload — appearance persists; native window/splash background follows.
- Run `python3 scripts/verify-ipc-split.py` after IPC changes.
- `bunx tsc --noEmit -p tsconfig.json`.

## Open questions

- Exact built-in preset list and names (suggest: Qeda Azure, Neutral, Zinc, Rose, Emerald, Violet).
- Whether preset selection should also set a recommended mode, or stay fully mode-independent (recommended: mode-independent).
