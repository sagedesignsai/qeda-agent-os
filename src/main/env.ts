/**
 * main/env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the project's env files into `process.env` for the main process.
 *
 * Why this is needed: electron-vite (via Vite) only exposes variables prefixed
 * with VITE_ / MAIN_VITE_ / PRELOAD_VITE_ / RENDERER_VITE_ and never populates
 * `process.env` from `.env*` at runtime. Provider keys such as GROQ_API_KEY are
 * deliberately unprefixed, so without this the registry would see an empty
 * environment and fall back to defaults.
 *
 * Precedence: OS-provided values win, then `.env.local`, then `.env` defaults.
 * In a packaged build these files are not shipped, so credentials come from
 * the encrypted Settings store instead — see ai/settings.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { config as loadEnvFile } from 'dotenv';

/** Load the higher-precedence local file first; shared defaults fill gaps. */
const ENV_FILES = ['.env.local', '.env'];

export function loadEnvironment(): void {
  const root = app.getAppPath();

  for (const file of ENV_FILES) {
    const result = loadEnvFile({
      path: path.join(root, file),
      // Never clobber a value already loaded from the OS or an earlier file.
      override: false,
      quiet: true,
    });

    if (result.error) {
      // Missing files are the normal case in a packaged build.
      log.debug(`[env] ${file} not loaded: ${result.error.message}`);
    } else {
      log.info(`[env] loaded ${file}`);
    }
  }
}
