/**
 * lib/trace/narration-client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-side narration synthesis surface.
 *
 * Wraps the `trace:narration-generate` channel so the narration dialog never
 * touches channel strings. Durations come back measured; this layer never
 * estimates them.
 */

import type { TtsProviderId } from '../tts/types';

export interface NarrationVoiceRequest {
  lines: Array<{ id?: string; text: string }>;
  provider?: TtsProviderId;
  voiceId?: string;
  projectId?: string;
}

export interface NarrationVoiceLine {
  id?: string;
  text: string;
  ttsAssetId: string;
  durationMs: number;
}

export type NarrationVoiceResponse =
  | {
      lines: NarrationVoiceLine[];
      warnings: string[];
      provider: TtsProviderId;
    }
  | { error: string };

export function generateTraceNarrationVoice(
  request: NarrationVoiceRequest,
): Promise<NarrationVoiceResponse> {
  return window.electron.ipc.invoke('trace:narration-generate', request);
}