/**
 * main/tts/paths.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Where generated speech and the voice cache live.
 *
 * Everything is under `userData/tts`, so the renderer never needs a filesystem
 * path: playback goes through `qeda-media://tts/<id>`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import path from 'node:path';
import {
  TTS_FORMAT_EXTENSION,
  type TtsFormat,
  type TtsProviderId,
} from '../../lib/tts/types.js';

let testRoot: string | null = null;

/** Test hook: redirect every TTS path at a temporary directory. */
export function setTtsRootForTests(root: string | null): void {
  testRoot = root;
}

export function ttsRootDir(): string {
  return testRoot ?? path.join(app.getPath('userData'), 'tts');
}

export function ttsAssetPath(id: string, format: TtsFormat): string {
  return path.join(ttsRootDir(), `${id}${TTS_FORMAT_EXTENSION[format]}`);
}

export function ttsVoiceCachePath(provider: TtsProviderId): string {
  return path.join(ttsRootDir(), 'voices', `${provider}.json`);
}

export function ttsTempPath(id: string): string {
  return path.join(ttsRootDir(), `.${id}.part`);
}
