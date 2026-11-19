/**
 * main/tts/providers/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The adapters the core can actually run today.
 *
 * ElevenLabs and Cartesia are registered in `services/registry.ts` for key
 * management, but not here until their adapters land. A provider with no
 * adapter returns `PROVIDER_UNSUPPORTED` rather than silently falling back.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TtsCapabilities, TtsProviderId } from '../../../lib/tts/types.js';
import { deepgramAdapter } from './deepgram.js';
import type { TtsProviderAdapter } from './types.js';

const ADAPTERS: Partial<Record<TtsProviderId, TtsProviderAdapter>> = {
  deepgram: deepgramAdapter,
};

export function getTtsAdapter(
  id: TtsProviderId,
): TtsProviderAdapter | null {
  return ADAPTERS[id] ?? null;
}

export function implementedTtsProviders(): TtsProviderId[] {
  return Object.keys(ADAPTERS) as TtsProviderId[];
}

export function listTtsCapabilities(): TtsCapabilities[] {
  return implementedTtsProviders().map(
    (id) => ADAPTERS[id]!.capabilities,
  );
}
