/**
 * main/tts/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public surface of the main-process TTS core.
 *
 * Consumers outside this folder (IPC handlers, the chat tool, Studio services)
 * import from here rather than reaching into providers or storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  TtsError,
  cancelTts,
  deleteTtsAsset,
  estimateTts,
  generateTtsAsset,
  getTtsAssetPath,
  previewVoice,
  ttsCapabilities,
  type GenerateOptions,
} from './engine.js';
export {
  getTtsAsset,
  listTtsAssets,
  softDeleteTtsAsset,
  toPublicTtsAsset,
  type TtsAssetRecord,
} from './store.js';
export { defaultTtsFilename, exportTtsAsset } from './export.js';
export { loadDeepgramVoices, findDeepgramVoice } from './voices.js';
export {
  getTtsAdapter,
  implementedTtsProviders,
  listTtsCapabilities,
} from './providers/registry.js';
export { deepgramSynthesize } from './providers/deepgram.js';
export { chunkText, applyPronunciations } from './chunk.js';
export { stitchAudio, parseWav, buildWav } from './stitch.js';
export { probeAudioDurationMs, wavDurationMs } from './duration.js';
export { resolveTtsFormat } from './format.js';
export { ttsRootDir, ttsAssetPath, setTtsRootForTests } from './paths.js';
