/**
 * main/tts/engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The orchestration layer between a renderer request and a playable asset.
 *
 * Responsibilities, in the order they run:
 *   1. Resolve provider, key, voice, format and speed (request → settings →
 *      provider default), so callers only specify what they care about.
 *   2. Prepare text: IPA substitutions, then chunking under the provider limit.
 *   3. Downgrade formats that cannot be stitched for multi-chunk scripts.
 *   4. Reuse an identical prior generation when `reuse !== false`.
 *   5. Synthesize sequentially, reporting progress and honouring cancellation.
 *   6. Stitch, write atomically, probe duration and persist metadata.
 *
 * Errors are thrown as `TtsError` with a machine-readable code. The IPC layer
 * converts them into `TtsResult` because Electron only serialises
 * `Error.message`, and a Studio dialog must distinguish "no key" from "rate
 * limited" to offer the right next step.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSettings } from '../ai/settings.js';
import { resolveService } from '../services/keys.js';
import { ServiceHttpError } from '../services/http.js';
import { ttsMediaUrl } from '../../lib/tts/media.js';
import {
  DEFAULT_TTS_FORMAT,
  DEFAULT_TTS_VOICE,
  TTS_FORMAT_MIME,
  type TtsAsset,
  type TtsAssetKind,
  type TtsCapabilities,
  type TtsErrorCode,
  type TtsEstimate,
  type TtsFormat,
  type TtsGenerateRequest,
  type TtsProgress,
  type TtsPronunciation,
  type TtsProviderId,
  type TtsSettings,
} from '../../lib/tts/types.js';
import { applyPronunciations, chunkText } from './chunk.js';import { probeAudioDurationMs } from './duration.js';
import { resolveTtsFormat } from './format.js';
import { ttsAssetPath, ttsRootDir, ttsTempPath } from './paths.js';
import { getTtsAdapter, listTtsCapabilities } from './providers/registry.js';
import type { TtsProviderAdapter } from './providers/types.js';
import { stitchAudio } from './stitch.js';
import {
  findTtsAssetByCacheKey,
  getTtsAsset,
  insertTtsAsset,
  softDeleteTtsAsset,
  toPublicTtsAsset,
  touchTtsAsset,
  type TtsAssetRecord,
} from './store.js';

/** Bump when stitching/pronunciation/cache semantics change. */
const ENGINE_VERSION = 1;

/** Headroom under Deepgram's 2 000-character per-request ceiling. */
const LONG_FORMAT_TARGET = 1_900;

const PREVIEW_TEXT = 'Hello, this is how I sound.';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export class TtsError extends Error {
  readonly code: TtsErrorCode;
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    code: TtsErrorCode,
    message: string,
    opts: { status?: number; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'TtsError';
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.requestId !== undefined) this.requestId = opts.requestId;
  }
}

export interface GenerateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TtsProgress) => void;
  fetchImpl?: typeof fetch;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TtsError('ABORTED', 'Speech generation was cancelled.'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new TtsError('ABORTED', 'Speech generation was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TtsError('ABORTED', 'Speech generation was cancelled.');
  }
}

function mapHttpError(error: unknown): TtsError {
  if (error instanceof TtsError) return error;
  if (error instanceof ServiceHttpError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new TtsError('AUTH_FAILED', error.message, { status });
    }
    if (status === 402) {
      return new TtsError('CREDITS_EXHAUSTED', error.message, { status });
    }
    if (status === 413) {
      return new TtsError('TEXT_TOO_LONG', error.message, { status });
    }
    if (status === 429) {
      return new TtsError('RATE_LIMITED', error.message, { status });
    }
    if (
      status === 400 &&
      /model|voice|speaker/i.test(error.message)
    ) {
      return new TtsError('VOICE_UNKNOWN', error.message, { status });
    }
    if (status === 400) {
      return new TtsError('INVALID_REQUEST', error.message, { status });
    }
    return new TtsError('PROVIDER_ERROR', error.message, { status });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(message)) {
    return new TtsError('ABORTED', 'Speech generation was cancelled.');
  }
  return new TtsError('PROVIDER_ERROR', message);
}

function retryAfterMs(error: unknown): number | null {
  if (!(error instanceof ServiceHttpError)) return null;
  const match = /retry[- ]after[^0-9]*(\d+(?:\.\d+)?)/i.exec(error.message);
  if (!match) return null;
  return Math.max(0, Math.round(Number(match[1]) * 1000));
}

async function synthesizeWithRetry(
  adapter: TtsProviderAdapter,
  input: Parameters<TtsProviderAdapter['synthesize']>[0],
): Promise<Awaited<ReturnType<TtsProviderAdapter['synthesize']>>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    assertNotAborted(input.signal);
    try {
      return await adapter.synthesize(input);
    } catch (error) {
      lastError = error;
      if (input.signal?.aborted) {
        throw new TtsError('ABORTED', 'Speech generation was cancelled.');
      }
      const status =
        error instanceof ServiceHttpError ? error.status : undefined;
      if (
        attempt >= MAX_ATTEMPTS ||
        status === undefined ||
        !RETRYABLE_STATUSES.has(status)
      ) {
        throw mapHttpError(error);
      }
      const delay = retryAfterMs(error) ?? 400 * 2 ** (attempt - 1);
      await sleep(delay, input.signal);
    }
  }
  throw mapHttpError(lastError);
}

function settingsTtsDefaults(
  provider: TtsProviderId,
): { voiceId?: string; format?: TtsFormat; speed?: number } {
  const tts = getSettings().tts as TtsSettings | undefined;
  return tts?.defaults?.[provider] ?? {};
}

function resolveVoiceId(
  request: TtsGenerateRequest,
  provider: TtsProviderId,
): string {
  const fromRequest = request.voiceId?.trim();
  if (fromRequest) return fromRequest;
  const fromSettings = settingsTtsDefaults(provider).voiceId?.trim();
  if (fromSettings) return fromSettings;
  return DEFAULT_TTS_VOICE[provider];
}

function resolveFormat(
  request: TtsGenerateRequest,
  provider: TtsProviderId,
): TtsFormat {
  return request.format ?? settingsTtsDefaults(provider).format ?? DEFAULT_TTS_FORMAT;
}

function resolveSpeed(
  request: TtsGenerateRequest,
  provider: TtsProviderId,
  capabilities: TtsCapabilities,
): number | undefined {
  const requested =
    request.speed ?? settingsTtsDefaults(provider).speed ?? undefined;
  if (requested === undefined || requested === null) return undefined;
  const speed = capabilities.speed;
  if (!speed) return undefined;
  if (
    !Number.isFinite(requested) ||
    requested < speed.min ||
    requested > speed.max
  ) {
    throw new TtsError(
      'INVALID_REQUEST',
      `Speed must be between ${speed.min} and ${speed.max} (received ${requested}).`,
    );
  }
  return requested;
}

function normalizePronunciations(
  entries: TtsPronunciation[] | undefined,
): TtsPronunciation[] {
  if (!entries) return [];
  return entries
    .map((entry) => ({
      word: entry.word?.trim() ?? '',
      ipa: entry.ipa?.trim() ?? '',
    }))
    .filter((entry) => entry.word.length > 0 && entry.ipa.length > 0);
}

function cacheKeyFor(input: {
  provider: TtsProviderId;
  voiceId: string;
  format: TtsFormat;
  sampleRate?: number;
  bitrate?: number;
  speed?: number;
  pronunciations: TtsPronunciation[];
  text: string;
  mipOptOut?: boolean;
  kind: TtsAssetKind;
}): string {
  const payload = JSON.stringify({
    v: ENGINE_VERSION,
    provider: input.provider,
    voiceId: input.voiceId,
    format: input.format,
    sampleRate: input.sampleRate ?? null,
    bitrate: input.bitrate ?? null,
    speed: input.speed ?? null,
    pronunciations: input.pronunciations,
    text: input.text,
    mipOptOut: Boolean(input.mipOptOut),
    kind: input.kind,
  });
  return createHash('sha256').update(payload).digest('hex');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

async function writeAtomic(
  finalPath: string,
  tempPath: string,
  bytes: Uint8Array,
): Promise<void> {
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  try {
    await fs.writeFile(tempPath, bytes);
    await fs.rename(tempPath, finalPath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw new TtsError(
      'IO_ERROR',
      `Could not save the generated audio: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// ─── Cancellation registry ───────────────────────────────────────────────────

interface ActiveJob {
  controller: AbortController;
}

const activeJobs = new Map<string, ActiveJob>();

export function cancelTts(requestId: string): boolean {
  const job = activeJobs.get(requestId);
  if (!job) return false;
  job.controller.abort();
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function ttsCapabilities(): TtsCapabilities[] {
  return listTtsCapabilities();
}

export async function estimateTts(
  req: TtsGenerateRequest,
): Promise<TtsEstimate> {
  const adapter = getTtsAdapter(req.provider);
  if (!adapter) {
    throw new TtsError(
      'PROVIDER_UNSUPPORTED',
      `${req.provider} speech generation is not available yet.`,
    );
  }
  const text = req.text.replace(/\r\n?/g, '\n');
  if (!text.trim()) {
    throw new TtsError('INVALID_REQUEST', 'Add some text to synthesize.');
  }

  const prepared = applyPronunciations(
    text,
    normalizePronunciations(req.pronunciations),
  );
  const chunks = chunkText(prepared.text, LONG_FORMAT_TARGET);
  const requested = resolveFormat(req, req.provider);
  let resolved: ReturnType<typeof resolveTtsFormat>;
  try {
    resolved = resolveTtsFormat(
      requested,
      chunks.length,
      adapter.capabilities,
    );
  } catch (error) {
    throw new TtsError(
      'FORMAT_UNSUPPORTED',
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    chars: text.length,
    chunks: chunks.length,
    maxChars: adapter.capabilities.maxChars,
    format: resolved.format,
    willFallback: Boolean(resolved.warning),
    ...(resolved.warning ? { fallbackFrom: requested } : {}),
  };
}

export async function generateTtsAsset(
  req: TtsGenerateRequest,
  opts: GenerateOptions = {},
): Promise<TtsAsset> {
  return generate(req, { ...opts, kind: 'speech' });
}

export async function previewVoice(
  req: Omit<TtsGenerateRequest, 'origin'>,
  opts: GenerateOptions = {},
): Promise<TtsAsset> {
  const text = req.text?.trim() ? req.text : PREVIEW_TEXT;
  return generate(
    {
      ...req,
      text,
      label: req.label ?? 'Voice preview',
      origin: 'settings',
      originId: req.voiceId ?? null,
      reuse: req.reuse ?? true,
    },
    { ...opts, kind: 'voice-preview' },
  );
}

export function getTtsAssetPath(id: string): string | null {
  const record = getTtsAsset(id);
  return record ? record.path : null;
}

export function deleteTtsAsset(id: string): boolean {
  return softDeleteTtsAsset(id);
}

async function generate(
  req: TtsGenerateRequest,
  opts: GenerateOptions & { kind: TtsAssetKind },
): Promise<TtsAsset> {
  const requestId = req.requestId?.trim() || randomUUID();
  const adapter = getTtsAdapter(req.provider);
  if (!adapter) {
    throw new TtsError(
      'PROVIDER_UNSUPPORTED',
      `${req.provider} speech generation is not available yet.`,
      { requestId },
    );
  }

  const resolvedService = resolveService(req.provider);
  if (!resolvedService.ok) {
    throw new TtsError('NOT_CONFIGURED', resolvedService.error, { requestId });
  }

  const voiceId = resolveVoiceId(req, req.provider);
  const requestedFormat = resolveFormat(req, req.provider);
  const speed = resolveSpeed(req, req.provider, adapter.capabilities);
  const pronunciations = normalizePronunciations(req.pronunciations);

  const normalizedText = req.text.replace(/\r\n?/g, '\n');
  if (!normalizedText.trim()) {
    throw new TtsError('INVALID_REQUEST', 'Add some text to synthesize.', {
      requestId,
    });
  }

  const prepared = applyPronunciations(normalizedText, pronunciations);
  const chunks = chunkText(prepared.text, LONG_FORMAT_TARGET);
  if (chunks.length === 0) {
    throw new TtsError('INVALID_REQUEST', 'Add some text to synthesize.', {
      requestId,
    });
  }

  let resolvedFormat: ReturnType<typeof resolveTtsFormat>;
  try {
    resolvedFormat = resolveTtsFormat(
      requestedFormat,
      chunks.length,
      adapter.capabilities,
    );
  } catch (error) {
    throw new TtsError(
      'FORMAT_UNSUPPORTED',
      error instanceof Error ? error.message : String(error),
      { requestId },
    );
  }
  const format = resolvedFormat.format;

  const cacheKey = cacheKeyFor({
    provider: req.provider,
    voiceId,
    format,
    ...(req.sampleRate !== undefined ? { sampleRate: req.sampleRate } : {}),
    ...(req.bitrate !== undefined ? { bitrate: req.bitrate } : {}),
    ...(speed !== undefined ? { speed } : {}),
    pronunciations,
    text: prepared.text,
    ...(req.mipOptOut ? { mipOptOut: true } : {}),
    kind: opts.kind,
  });

  if (req.reuse !== false) {
    const cached = findTtsAssetByCacheKey(cacheKey);
    if (cached && (await fileExists(cached.path))) {
      touchTtsAsset(cached.id);
      return toPublicTtsAsset(cached);
    }
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  activeJobs.set(requestId, { controller });

  const emit = (progress: Omit<TtsProgress, 'requestId'>) => {
    opts.onProgress?.({ requestId, ...progress });
  };

  const warnings = new Set<string>();
  if (prepared.warnings.length > 0) {
    prepared.warnings.forEach((warning) => warnings.add(warning));
  }
  if (resolvedFormat.warning) warnings.add(resolvedFormat.warning);

  let writtenPath: string | null = null;

  try {
    emit({ phase: 'resolving', charsTotal: prepared.text.length });

    const parts: Uint8Array[] = [];
    let charsDone = 0;
    let model = voiceId;

    for (let index = 0; index < chunks.length; index += 1) {
      assertNotAborted(controller.signal);
      const chunk = chunks[index]!;
      emit({
        phase: 'chunk',
        chunkIndex: index + 1,
        chunkTotal: chunks.length,
        charsDone,
        charsTotal: prepared.text.length,
      });

      const audio = await synthesizeWithRetry(adapter, {
        apiKey: resolvedService.value.apiKey,
        text: chunk.text,
        voiceId,
        format: {
          format,
          ...(req.sampleRate !== undefined
            ? { sampleRate: req.sampleRate }
            : {}),
          ...(req.bitrate !== undefined ? { bitrate: req.bitrate } : {}),
        },
        ...(speed !== undefined ? { speed } : {}),
        ...(pronunciations.length > 0 ? { pronunciations } : {}),
        ...(req.mipOptOut ? { mipOptOut: true } : {}),
        signal: controller.signal,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      });

      parts.push(audio.bytes);
      audio.warnings.forEach((warning) => warnings.add(warning));
      if (audio.model) model = audio.model;
      charsDone += chunk.text.length;
    }

    emit({
      phase: 'stitch',
      chunkTotal: chunks.length,
      charsDone,
      charsTotal: prepared.text.length,
    });

    let bytes: Uint8Array;
    try {
      bytes = stitchAudio(parts, format);
    } catch (error) {
      throw new TtsError(
        'STITCH_FAILED',
        error instanceof Error ? error.message : String(error),
        { requestId },
      );
    }

    assertNotAborted(controller.signal);
    emit({
      phase: 'saving',
      chunkTotal: chunks.length,
      charsDone,
      charsTotal: prepared.text.length,
    });

    const id = randomUUID();
    const finalPath = ttsAssetPath(id, format);
    await writeAtomic(finalPath, ttsTempPath(id), bytes);
    writtenPath = finalPath;

    const durationMs = await probeAudioDurationMs(finalPath, format);
    // The write and duration probe can outlive a cancel; do not record an asset
    // the caller has already abandoned.
    assertNotAborted(controller.signal);
    const createdAt = Math.floor(Date.now() / 1000);

    const record: TtsAssetRecord = {
      id,
      kind: opts.kind,
      provider: req.provider,
      model,
      voiceId,
      text: req.text,
      charCount: normalizedText.length,
      format,
      mimeType: TTS_FORMAT_MIME[format],
      bytes: bytes.byteLength,
      durationMs,
      sampleRate: req.sampleRate ?? inferSampleRate(format),
      bitrate: req.bitrate ?? inferBitrate(format),
      speed: speed ?? null,
      label: req.label?.trim() || null,
      projectId: req.projectId ?? null,
      origin: req.origin ?? 'library',
      originId: req.originId ?? null,
      requestId,
      warnings: [...warnings],
      createdAt,
      url: ttsMediaUrl(id),
      path: finalPath,
      cacheKey,
      pronunciations,
      accessedAt: null,
      deletedAt: null,
    };

    try {
      insertTtsAsset(record);
    } catch (error) {
      await fs.unlink(finalPath).catch(() => {});
      throw new TtsError(
        'IO_ERROR',
        `Could not record the generated audio: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { requestId },
      );
    }

    return toPublicTtsAsset(record);
  } catch (error) {
    if (writtenPath) {
      await fs.unlink(writtenPath).catch(() => {});
    }
    if (controller.signal.aborted) {
      throw new TtsError('ABORTED', 'Speech generation was cancelled.', {
        requestId,
      });
    }
    const mapped = mapHttpError(error);
    throw new TtsError(mapped.code, mapped.message, {
      ...(mapped.status !== undefined ? { status: mapped.status } : {}),
      requestId,
    });
  } finally {
    opts.signal?.removeEventListener('abort', onExternalAbort);
    activeJobs.delete(requestId);
  }
}

function inferSampleRate(format: TtsFormat): number | null {
  return format === 'wav' ? 24_000 : null;
}

function inferBitrate(format: TtsFormat): number | null {
  return format === 'mp3' ? 48_000 : null;
}
