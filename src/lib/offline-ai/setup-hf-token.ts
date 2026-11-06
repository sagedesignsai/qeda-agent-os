/**
 * lib/offline-ai/setup-hf-token.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Injects the Hugging Face access token into Transformers.js fetch requests.
 *
 * Transformers.js only reads HF_TOKEN from process.env in Node.js environments.
 * In the Electron renderer (a browser environment), process.env is unavailable,
 * so the Authorization header is never added to Hugging Face requests — causing
 * "401 Unauthorized" errors when downloading models.
 *
 * This module fetches the token from the main process via IPC and overrides
 * `env.fetch` from Transformers.js to inject the Bearer token for HF URLs.
 *
 * Call `setupHfToken()` once at app startup before any model download.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { env } from '@huggingface/transformers';

let initialized = false;

/**
 * Fetch the HF token from the main process and wire it into Transformers.js.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function setupHfToken(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Only run in Electron renderer (window.electron exists)
  if (typeof window === 'undefined') return;

  const win = window as any;
  if (!win.electron?.ipc?.invoke) return;

  try {
    const token: string | null = await win.electron.ipc.invoke(
      'settings:get-hf-token',
    );
    if (!token) return;

    // Override env.fetch to inject the Authorization header for HF URLs.
    const originalFetch = env.fetch;
    env.fetch = async (input: string | URL, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      const isHfUrl =
        urlStr.includes('huggingface.co') || urlStr.includes('hf.co');

      if (isHfUrl) {
        const headers = new Headers(init?.headers ?? {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      }

      return originalFetch(input, init);
    };
  } catch {
    // If IPC fails (e.g., main process not ready), silently skip —
    // downloads will proceed without auth and may fail for gated models.
  }
}
