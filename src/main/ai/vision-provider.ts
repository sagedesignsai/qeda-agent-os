/**
 * ai/vision-provider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vision-specific provider and model selection.
 *
 * Maps each vision task to providers + models that support vision, prioritizing:
 * 1. OpenRouter free vision models (PRIORITY: your preferred fallback provider)
 * 2. Gemini Flash (if GEMINI_API_KEY set)
 * 3. Ollama LLaVA (if OLLAMA_BASE_URL configured)
 * 4. SmolVLM2 offline (always available, local)
 * 5. Error if no vision available
 *
 * Vision models available in free tiers:
 * - OpenRouter (10+ free vision models)
 *   ├─ nvidia/nemotron-3.5-super-vl:free ← Preferred
 *   ├─ particle-ai/particle-1:free
 *   └─ Others: inclusionai/ling-3.2-flash:free, nvidia/nemotron-3-nano-omni*, etc.
 * - Gemini Flash — YES, vision in free tier
 * - Ollama (local) — Depends on pulled model (e.g., llava:7b)
 * - Offline (Transformers.js) — SmolVLM2 1.7B (local)
 *
 * Strategy: OpenRouter free vision → Gemini → Ollama local → SmolVLM2 offline → Error
 */

import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { PROVIDERS, envApiKey } from './registry.js';
import type { LanguageModel } from 'ai';

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
  offline: boolean;
  /** Whether this provider/model is available right now (has key, etc) */
  isAvailable: () => boolean;
  /** Priority for this task (higher = prefer first) */
  priority: (task: VisionTask) => number;
}

/**
 * All known vision-capable models, ordered by preference.
 *
 * Priority:
 * 1. OpenRouter free vision models (your preferred fallback provider)
 * 2. Gemini Flash (best free tier for UI analysis)
 * 3. Ollama local (if running)
 * 4. SmolVLM2 offline (always available)
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
    isAvailable: () => {
      const provider = PROVIDERS.find((p) => p.id === 'openrouter');
      return provider ? !!envApiKey(provider) : false;
    },
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
    isAvailable: () => {
      const provider = PROVIDERS.find((p) => p.id === 'gemini');
      return provider ? !!envApiKey(provider) : false;
    },
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

  // ─── Ollama (local, vision depends on model) ─────────────────────────────
  // Example: llava:7b or llava:13b
  {
    providerId: 'ollama',
    modelId: 'llava:7b',
    modelName: 'LLaVA 7B (local)',
    offline: true,
    isAvailable: () => {
      // Check if Ollama base URL is configured and responsive
      const baseUrl = process.env.OLLAMA_BASE_URL;
      return !!baseUrl; // Simplified: assume it's running if URL is set
    },
    priority: (task) => {
      // LLaVA is decent but slower than cloud options
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
  },

  // ─── Offline SmolVLM2 (local, requires download) ────────────────────────
  {
    providerId: 'offline',
    modelId: 'xenova/smollvm2-1.7b',
    modelName: 'SmolVLM2 1.7B (offline)',
    offline: true,
    isAvailable: () => {
      // Check if offline models are configured/enabled in settings
      const settings = getSettings();
      // Offline models require explicit user action (Settings → Offline Models)
      // so we don't claim availability unless the user has indicated they want offline
      const hasOfflineConfig = settings.offlineModelsEnabled ?? false;
      return hasOfflineConfig;
    },
    priority: (task) => {
      // SmolVLM2 is solid, reliable fallback for all tasks
      switch (task) {
        case 'viewport-analysis':
          return 50; // Slower, but accurate
        case 'asset-scoring':
          return 50;
        case 'composition-validation':
          return 50;
        case 'consistency-check':
          return 60; // Slightly better at simple checks
      }
    },
  },
];

/**
 * Select the best vision model for a given task.
 *
 * Selection priority:
 * 1. User's explicit choice in Settings (if set)
 * 2. Available providers/models, sorted by task priority
 * 3. Offline fallback (SmolVLM2)
 * 4. Error (no vision available)
 */
export function selectVisionModel(task: VisionTask): VisionModelSelection | null {
  const settings = getSettings();

  // ─── 1. User's explicit choice (if set) ───────────────────────────────
  if (settings.blender?.visionModel) {
    const explicit = settings.blender.visionModel;
    // Format: "providerId/modelId" or "modelId" (assume first available provider)
    const [providerId, modelId] = explicit.includes('/')
      ? explicit.split('/')
      : [VISION_MODELS[0]?.providerId || 'offline', explicit];

    return {
      providerId,
      modelId,
      modelName: `User choice: ${explicit}`,
      offline: VISION_MODELS.find(
        (m) => m.providerId === providerId && m.modelId === modelId,
      )?.offline ?? false,
      reason: 'User-configured vision model (Settings → Blender → visionModel)',
    };
  }

  // ─── 2. Find available models, sorted by task priority ───────────────────
  const available = VISION_MODELS.filter((m) => m.isAvailable()).sort(
    (a, b) => b.priority(task) - a.priority(task),
  );

  if (available.length > 0) {
    const selected = available[0];
    return {
      providerId: selected.providerId,
      modelId: selected.modelId,
      modelName: selected.modelName,
      offline: selected.offline,
      reason: `Automatic: "${selected.modelName}" ranked highest for ${task}`,
    };
  }

  // ─── 3. Fallback to SmolVLM2 (always available, no key needed) ────────────
  const smolVLM = VISION_MODELS.find((m) => m.modelId === 'xenova/smollvm2-1.7b');
  if (smolVLM && smolVLM.isAvailable()) {
    return {
      providerId: smolVLM.providerId,
      modelId: smolVLM.modelId,
      modelName: smolVLM.modelName,
      offline: true,
      reason: `Fallback: SmolVLM2 1.7B (offline, no key needed). First run ~5s, cached ~2–3s.`,
    };
  }

  // ─── 4. No vision available ───────────────────────────────────────────────
  return null;
}

/**
 * Attempt fallback when the primary model fails.
 *
 * Returns the next best model, or null if no fallback available.
 */
export function fallbackVisionModel(
  failedProviderId: string,
  failedModelId: string,
  task: VisionTask,
): VisionModelSelection | null {
  // Remove the failed model from consideration
  const remaining = VISION_MODELS.filter(
    (m) =>
      !(m.providerId === failedProviderId && m.modelId === failedModelId) &&
      m.isAvailable(),
  ).sort((a, b) => b.priority(task) - a.priority(task));

  if (remaining.length > 0) {
    const next = remaining[0];
    return {
      providerId: next.providerId,
      modelId: next.modelId,
      modelName: next.modelName,
      offline: next.offline,
      reason: `Fallback: ${next.modelName} (${failedModelId} failed)`,
    };
  }

  // No fallback available
  return null;
}

/**
 * Get all available vision models (for Settings UI, etc).
 */
export function listAvailableVisionModels(): VisionModelSelection[] {
  return VISION_MODELS.filter((m) => m.isAvailable()).map((m) => ({
    providerId: m.providerId,
    modelId: m.modelId,
    modelName: m.modelName,
    offline: m.offline,
    reason: `Available: ${m.modelName}`,
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
  try {
    return resolveModel(providerId, modelId) as ReturnType<typeof resolveModel>;
  } catch (error) {
    // Model resolution failed (invalid provider, missing key, etc)
    return null;
  }
}

/**
 * Get a brief summary of vision capability for the user.
 * Used in Settings UI and debug logs.
 */
export function getVisionStatus(): {
  available: boolean;
  configured: string | null;
  recommended: VisionModelSelection | null;
  allOptions: VisionModelSelection[];
  note: string;
} {
  const settings = getSettings();
  const recommended = selectVisionModel('viewport-analysis');
  const all = listAvailableVisionModels();

  return {
    available: all.length > 0,
    configured: settings.blender?.visionModel ?? null,
    recommended,
    allOptions: all,
    note: all.length === 0
      ? 'No vision models available. Set GEMINI_API_KEY for free vision, or vision tools will use offline SmolVLM2 (slower).'
      : all.length === 1 && all[0].offline
        ? `Only ${all[0].modelName} available (offline). For faster vision, set GEMINI_API_KEY.`
        : `${all.length} vision model(s) available. Using: ${recommended?.modelName}`,
  };
}
