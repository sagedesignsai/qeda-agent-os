/**
 * ai/vision-provider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vision-specific provider and model selection.
 *
 * Maps each vision task to providers + models that support vision, prioritizing:
 * 1. OpenRouter free vision models (PRIORITY: your preferred fallback provider)
 * 2. Gemini Flash (if GEMINI_API_KEY set)
 * 3. Ollama (only models that are actually installed and vision-capable)
 * 4. Error if no supported vision model is available
 *
 * Vision models available in free tiers:
 * - OpenRouter (10+ free vision models)
 *   ├─ nvidia/nemotron-3.5-super-vl:free ← Preferred
 *   ├─ particle-ai/particle-1:free
 *   └─ Others: inclusionai/ling-3.2-flash:free, nvidia/nemotron-3-nano-omni*, etc.
 * - Gemini Flash — YES, vision in free tier
 * - Ollama (local) — discovered from `ollama list`, filtered to vision families
 * Transformers.js inference currently supports text generation only; it is
 * not advertised here as a vision provider.
 *
 * Strategy: OpenRouter free vision → Gemini → installed Ollama vision → Error
 */

import { getSettings } from './settings.js';
import { resolveApiKey, resolveModel } from './provider.js';
import { listOllamaModels } from './ollama.js';

export type VisionTask =
  | 'viewport-analysis'
  | 'asset-scoring'
  | 'composition-validation'
  | 'consistency-check';

export interface VisionModelSelection {
  providerId: string;
  modelId: string;
  modelName: string;
  offline: boolean;
  reason: string;
}

/**
 * Vision capabilities per provider/model.
 * Not all models in Qeda have vision; this maps the ones that do.
 */
interface VisionCapability {
  providerId: string;
  modelId: string;
  modelName: string;
  /** True when inference stays on this machine (no cloud call). */
  offline: boolean;
  /** Whether this provider/model is available right now (has key, etc) */
  isAvailable: () => boolean;
  /** Priority for this task (higher = prefer first) */
  priority: (task: VisionTask) => number;
}

/**
 * Cloud vision models, ordered by preference.
 *
 * Ollama is deliberately absent: a static entry cannot know which models are
 * installed, so `llava:7b` used to be advertised even on a machine that had
 * never pulled it. Installed vision models are discovered at selection time.
 */
const VISION_MODELS: VisionCapability[] = [
  // ─── OpenRouter free vision models (PRIORITY 1) ──────────────────────────
  // OpenRouter has 10+ free vision models. Using nvidia/nemotron-3.5-super-vl:free
  // as it's one of the best free options available there.
  {
    providerId: 'openrouter',
    modelId: 'nvidia/nemotron-3.5-super-vl:free',
    modelName: 'NVIDIA Nemotron 3.5 Super VL (OpenRouter free)',
    offline: false,
    isAvailable: () => Boolean(resolveApiKey('openrouter')),
    priority: (task) => {
      // NVIDIA Nemotron is strong across all vision tasks
      switch (task) {
        case 'viewport-analysis':
          return 110; // Excellent at understanding UI/layout
        case 'asset-scoring':
          return 100; // Very good at visual quality assessment
        case 'composition-validation':
          return 105; // Strong spatial reasoning
        case 'consistency-check':
          return 95; // Good at comparing visuals
      }
    },
  },

  // ─── Gemini Flash (free tier, HAS VISION) ────────────────────────────────
  {
    providerId: 'gemini',
    modelId: 'gemini-3.8-flash',
    modelName: 'Gemini 3.8 Flash',
    offline: false,
    isAvailable: () => Boolean(resolveApiKey('gemini')),
    priority: (task) => {
      // Gemini Flash is solid for all vision tasks
      switch (task) {
        case 'viewport-analysis':
          return 100; // Excellent at UI analysis
        case 'asset-scoring':
          return 90; // Good, but not the best
        case 'composition-validation':
          return 95; // Good spatial reasoning
        case 'consistency-check':
          return 85; // Good enough
      }
    },
  },
];

/**
 * Names Ollama serves that can actually read images.
 *
 * `ollama list` returns every pulled model, so without this filter a text-only
 * install would look like it had a vision model and fail at the first request.
 */
const OLLAMA_VISION_MODEL =
  /(?:llava|bakllava|llama3(?:\.\d)?-vision|llama4|moondream|minicpm-v|qwen(?:2\.5|3)-vl|gemma3|pixtral|granite3(?:\.\d)?-vision)/i;

function isOllamaConfigured(): boolean {
  const settings = getSettings();
  return Boolean(
    settings.providers?.ollama?.baseURL?.trim() || process.env.OLLAMA_BASE_URL,
  );
}

function ollamaBaseURL(): string {
  const settings = getSettings();
  const configured =
    settings.providers?.ollama?.baseURL?.trim() ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434';
  return configured.replace(/\/v1\/?$/, '');
}

/**
 * Ask a running Ollama what it can actually serve. Returns an empty list when
 * Ollama is not configured or the server is unreachable — never the curated
 * `ollama pull` suggestions.
 *
 * The lookup is capped at 2s: `listOllamaModels` allows 10s, and a configured
 * but stopped server should not stall every vision request for that long.
 */
async function getOllamaVisionCapabilities(): Promise<VisionCapability[]> {
  if (!isOllamaConfigured()) return [];

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 2_000);
  });

  try {
    const result = await Promise.race([
      listOllamaModels(ollamaBaseURL()),
      timeout,
    ]);
    if (!result) return [];

    return result.models
      .filter((model) => OLLAMA_VISION_MODEL.test(model))
      .map((model) => ({
        providerId: 'ollama',
        modelId: model,
        modelName: `${model} (local)`,
        offline: true,
        // Verified against /api/tags, so no further probe is needed.
        isAvailable: () => true,
        priority: (task) => {
          switch (task) {
            case 'viewport-analysis':
              return 70;
            case 'asset-scoring':
              return 60;
            case 'composition-validation':
              return 65;
            case 'consistency-check':
              return 75; // Fast binary decisions are its strength
          }
        },
      }));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The explicit Settings choice, if one is set. */
function explicitSelection(): VisionModelSelection | null {
  const settings = getSettings();
  const explicit = settings.blender?.visionModel;
  if (!explicit) return null;

  // Format: "providerId/modelId" or "modelId" (assume first available provider)
  const slashIndex = explicit.indexOf('/');
  const providerId =
    slashIndex === -1
      ? VISION_MODELS[0]?.providerId
      : explicit.slice(0, slashIndex);
  const modelId = slashIndex === -1 ? explicit : explicit.slice(slashIndex + 1);
  if (!providerId || providerId === 'offline') return null;

  return {
    providerId,
    modelId,
    modelName: `User choice: ${explicit}`,
    offline: providerId === 'ollama',
    reason: 'User-configured vision model (Settings → Blender → visionModel)',
  };
}

/**
 * Every model that can serve this task right now, best first.
 *
 * Cloud entries keep their own availability probe; Ollama entries are already
 * filtered to installed, vision-capable models.
 */
export async function listVisionCandidates(
  task: VisionTask,
): Promise<VisionModelSelection[]> {
  const cloud = VISION_MODELS.filter((model) => model.isAvailable());
  const local = await getOllamaVisionCapabilities();

  return [...cloud, ...local]
    .sort((a, b) => b.priority(task) - a.priority(task))
    .map((model) => ({
      providerId: model.providerId,
      modelId: model.modelId,
      modelName: model.modelName,
      offline: model.offline,
      reason: `Automatic: "${model.modelName}" ranked highest for ${task}`,
    }));
}

/**
 * Select the best vision model for a given task.
 *
 * Selection priority:
 * 1. User's explicit choice in Settings (if set)
 * 2. Available providers/models, sorted by task priority
 * 3. `null` when nothing can serve the task (the caller reports it)
 */
export async function selectVisionModel(
  task: VisionTask,
): Promise<VisionModelSelection | null> {
  const explicit = explicitSelection();
  if (explicit) return explicit;

  const candidates = await listVisionCandidates(task);
  return candidates[0] ?? null;
}

/**
 * Attempt fallback when the primary model fails.
 *
 * `exclude` carries the keys already attempted so a retry loop walks the whole
 * ordered list instead of bouncing between the top two models.
 */
export async function fallbackVisionModel(
  failedProviderId: string,
  failedModelId: string,
  task: VisionTask,
  exclude: string[] = [],
): Promise<VisionModelSelection | null> {
  const excluded = new Set([
    `${failedProviderId}/${failedModelId}`,
    ...exclude,
  ]);
  const candidates = await listVisionCandidates(task);
  return (
    candidates.find(
      (candidate) =>
        !excluded.has(`${candidate.providerId}/${candidate.modelId}`),
    ) ?? null
  );
}

/**
 * Get all available vision models (for Settings UI, etc).
 */
export async function listAvailableVisionModels(): Promise<
  VisionModelSelection[]
> {
  const candidates = await listVisionCandidates('viewport-analysis');
  return candidates.map((candidate) => ({
    ...candidate,
    reason: `Available: ${candidate.modelName}`,
  }));
}

/**
 * Get a resolved AI model instance for vision tasks.
 *
 * Wraps resolveModel() to handle vision-specific logic.
 */
export function resolveVisionModel(
  providerId: string,
  modelId: string,
): ReturnType<typeof resolveModel> | null {
  if (providerId === 'offline') return null;
  try {
    return resolveModel(providerId, modelId) as ReturnType<typeof resolveModel>;
  } catch {
    // Model resolution failed (invalid provider, missing key, etc)
    return null;
  }
}

/**
 * Get a brief summary of vision capability for the user.
 * Used in Settings UI and debug logs.
 */
export async function getVisionStatus(): Promise<{
  available: boolean;
  configured: string | null;
  recommended: VisionModelSelection | null;
  allOptions: VisionModelSelection[];
  note: string;
}> {
  const settings = getSettings();
  const recommended = await selectVisionModel('viewport-analysis');
  const all = await listAvailableVisionModels();

  return {
    available: all.length > 0,
    configured: settings.blender?.visionModel ?? null,
    recommended,
    allOptions: all,
    note:
      all.length === 0
        ? 'No vision models available. Configure an OpenRouter or Gemini key, or pull a vision model in Ollama (for example: ollama pull llava:7b).'
        : all.length === 1 && all[0].offline
          ? `Only ${all[0].modelName} available (local). For faster vision, set GEMINI_API_KEY.`
          : `${all.length} vision model(s) available. Using: ${recommended?.modelName}`,
  };
}
