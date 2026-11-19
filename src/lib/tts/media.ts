/**
 * lib/tts/media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The `qeda-media://tts/<id>` host contract, shared by the main-process protocol
 * handler and the renderer that points audio elements at it.
 *
 * The URL carries a database id, never a path: the protocol resolver is the
 * only code that learns where the file lives.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const TTS_MEDIA_HOST = 'tts';

export function ttsMediaUrl(assetId: string): string {
  return `qeda-media://${TTS_MEDIA_HOST}/${encodeURIComponent(assetId)}`;
}
