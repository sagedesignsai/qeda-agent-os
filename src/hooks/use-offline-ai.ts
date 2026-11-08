/**
 * hooks/use-offline-ai.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for offline AI inference using Transformers.js.
 *
 * Downloads and caches a tiny language model for local, private inference.
 * Once cached, the model runs entirely offline with no network requests.
 * Uses WebGPU when available, falling back to WASM (CPU).
 *
 * The model files are cached by Transformers.js automatically, so subsequent
 * loads after the first download are fast and work offline.
 *
 * Recommended tiny models:
 *   - Xenova/distilgpt2          (~260MB, fast, decent quality)
 *   - Xenova/tinyllama-1.1b      (~630MB, better quality)
 *   - onnx-community/gpt2-ONNX   (~500MB, classic GPT-2)
 *
 * For smallest footprint, use Xenova/distilgpt2.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateText, streamText } from 'ai';
import {
  transformersJS,
  doesBrowserSupportTransformersJS,
} from '@browser-ai/transformers-js';
import { setupHfToken } from '@/lib/offline-ai/setup-hf-token';

// The default tiny model — instruction-tuned so it has a chat template
// (required by @browser-ai/transformers-js which always calls apply_chat_template).
const DEFAULT_MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';

export type OfflineAIStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'generating'
  | 'error';

export interface OfflineAIState {
  /** Current status of the offline AI system */
  status: OfflineAIStatus;
  /** Download progress 0-100 */
  progress: number;
  /** Whether WebGPU is available for accelerated inference */
  webgpuAvailable: boolean;
  /** Current error message, if any */
  error: string | null;
  /** The model ID currently loaded */
  modelId: string;
}

export interface UseOfflineAIOptions {
  /** Override the default model ID */
  modelId?: string;
  /** Force a specific device; auto-detects when omitted */
  device?: 'webgpu' | 'wasm';
  /** Custom cache directory for model files */
  cacheDir?: string;
  /** Path to load pre-downloaded model files from (for fully offline setups) */
  localModelPath?: string;
}

export function useOfflineAI(
  opts: UseOfflineAIOptions = {}
): OfflineAIState & {
  /** Send a prompt and receive a streamed response */
  generate: (prompt: string) => Promise<AsyncIterable<string>>;
  /** Send a prompt and get the full response (non-streaming) */
  generateText: (prompt: string) => Promise<string>;
  /** Reset the model state (useful for switching models) */
  reset: () => void;
  /** Manually trigger model download/initialization */
  initialize: () => Promise<void>;
} {
  const modelId = opts.modelId ?? DEFAULT_MODEL;
  const webgpuAvailable = doesBrowserSupportTransformersJS();
  const device = opts.device ?? (webgpuAvailable ? 'webgpu' : 'wasm');

  const [status, setStatus] = useState<OfflineAIStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const modelRef = useRef<ReturnType<typeof transformersJS> | null>(null);
  const initializingRef = useRef(false);

  // Inject the HF access token into Transformers.js fetch requests.
  // In the Electron renderer, process.env is unavailable, so Transformers.js
  // never adds the Authorization header — this bridges the gap.
  useEffect(() => {
    setupHfToken();
  }, []);

  // Create the worker instance lazily.
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    // In Electron renderer, create a worker from a blob URL since
    // the worker file is bundled with the main app.
    const workerCode = `
import { TransformersJSWorkerHandler } from '@browser-ai/transformers-js';
const handler = new TransformersJSWorkerHandler();
self.onmessage = (msg) => { handler.onmessage(msg); };
    `;

    // For Vite-bundled apps, use the dynamic import worker pattern.
    // The worker is created via a blob for Electron compatibility.
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    workerRef.current = worker;
    return worker;
  }, []);

  // Initialize the model with progress tracking.
  const initialize = useCallback(async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    try {
      setStatus('downloading');
      setError(null);
      setProgress(0);

      const worker = ensureWorker();

      // Create the model with progress callback.
      const model = transformersJS(modelId, {
        device,
        worker,
        cacheDir: opts.cacheDir,
        localModelPath: opts.localModelPath,
        initProgressCallback: (progressValue: number) => {
          // progressValue is 0-1, convert to 0-100
          setProgress(Math.round(progressValue * 100));
        },
      });

      modelRef.current = model;

      // Trigger initialization with a minimal generation call.
      // This causes the model to download and cache.
      await generateText({
        model: model as any,
        prompt: '.',
        maxOutputTokens: 1,
      });

      setStatus('ready');
      setProgress(100);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : 'Failed to initialize offline AI';

      // Provide a user-friendly message for memory allocation failures
      if (message.includes('Array buffer allocation failed') ||
          message.includes('Failed to allocate') ||
          message.includes('out of memory') ||
          message.toLowerCase().includes('oom')) {
        message = `Not enough memory to load the offline AI model (${modelId}). Try closing other applications, using a smaller model, or enabling WebGPU if available.`;
      }

      setError(message);
      setStatus('error');
    } finally {
      initializingRef.current = false;
    }
  }, [modelId, device, opts.cacheDir, opts.localModelPath, ensureWorker]);

  const generate = useCallback(
    async (prompt: string): Promise<AsyncIterable<string>> => {
      const model = modelRef.current;
      if (!model) {
        throw new Error(
          'Offline AI model not initialized. Call initialize() first.'
        );
      }

      setStatus('generating');

      const result = streamText({
        model: model as any,
        prompt,
        maxOutputTokens: 256,
      });

      const stream = result.textStream;
      return (async function* () {
        try {
          for await (const chunk of stream) {
            yield chunk;
          }
        } finally {
          setStatus('ready');
        }
      })();
    },
    []
  );

  const generateTextResponse = useCallback(
    async (prompt: string): Promise<string> => {
      const model = modelRef.current;
      if (!model) {
        throw new Error(
          'Offline AI model not initialized. Call initialize() first.'
        );
      }

      setStatus('generating');

      try {
        const result = await generateText({
          model: model as any,
          prompt,
          maxOutputTokens: 256,
        });
        return result.text;
      } finally {
        setStatus('ready');
      }
    },
    []
  );

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    modelRef.current = null;
    initializingRef.current = false;
    setStatus('idle');
    setProgress(0);
    setError(null);
  }, []);

  return {
    status,
    progress,
    webgpuAvailable,
    error,
    modelId,
    generate,
    generateText: generateTextResponse,
    reset,
    initialize,
  };
}
