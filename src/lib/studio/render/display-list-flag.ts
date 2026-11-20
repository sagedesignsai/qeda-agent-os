/**
 * lib/studio/render/display-list-flag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Feature switch for the Tier 2.5 display-list renderer.
 *
 * The legacy `drawStudioFrame` path stays the default until golden-frame parity
 * is signed off. Enable the new path with:
 *   - `STUDIO_DISPLAY_LIST=1` (Electron main / export runs), or
 *   - `window.__STUDIO_DISPLAY_LIST__ = true` (devtools / smoke tests).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ENV_FLAG = 'STUDIO_DISPLAY_LIST';

type FlagWindow = Window & { __STUDIO_DISPLAY_LIST__?: boolean };

export function isDisplayListRendererEnabled(): boolean {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env[ENV_FLAG] === '1'
  ) {
    return true;
  }
  if (typeof window !== 'undefined') {
    const override = (window as FlagWindow).__STUDIO_DISPLAY_LIST__;
    if (override !== undefined) return override;
  }
  return false;
}

/** Test/dev hook. Pass `undefined` to fall back to the environment flag. */
export function setDisplayListRendererOverride(
  value: boolean | undefined,
): void {
  if (typeof window === 'undefined') return;
  if (value === undefined) {
    delete (window as FlagWindow).__STUDIO_DISPLAY_LIST__;
    return;
  }
  (window as FlagWindow).__STUDIO_DISPLAY_LIST__ = value;
}
