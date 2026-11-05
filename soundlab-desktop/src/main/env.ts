/**
 * main/env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the project's env files into `process.env` for the main process.
 *
 * electron-vite only exposes VITE_ prefixed variables, so provider keys
 * like GROQ_API_KEY need this to be available in process.env.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { config as loadEnvFile } from 'dotenv';

const ENV_FILES = ['.env', '.env.local'];

export function loadEnvironment(): void {
  const root = app.getAppPath();

  for (const file of ENV_FILES) {
    const result = loadEnvFile({
      path: path.join(root, file),
      override: false,
      quiet: true,
    });

    if (result.error) {
      log.debug(`[env] ${file} not loaded: ${result.error.message}`);
    } else {
      log.info(`[env] loaded ${file}`);
    }
  }
}
